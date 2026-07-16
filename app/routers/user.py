import os
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.cores.database import get_db
from app.cores.security import get_current_user, hash_password, verify_password, require_manager
from app.models.user import User
from app.schemas.user import (
    ChangePassword,
    UserOut,
    UserCreateByManager,
    UserUpdateByManager,
    UserUpdateSelf,
)

router = APIRouter(prefix="/users", tags=["Users"])

PROFILE_PICTURE_DIR = "app/static/profile_pictures"
ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_PROFILE_PICTURE_SIZE = 5 * 1024 * 1024  # 5MB


@router.get("/me", response_model=UserOut)
def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_current_user(
    payload: UserUpdateSelf,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)

    if "username" in data:
        new_username = data.pop("username")
        if new_username and new_username != current_user.username:
            existing = db.query(User).filter(User.username == new_username).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already taken",
                )
            current_user.username = new_username
        # if new_username is empty/None, ignore — username can never be cleared

    for field, value in data.items():
        setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/profile-picture", response_model=UserOut)
async def upload_profile_picture(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, or WEBP images are allowed",
        )

    contents = await file.read()
    if len(contents) > MAX_PROFILE_PICTURE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image must be smaller than 5MB",
        )

    os.makedirs(PROFILE_PICTURE_DIR, exist_ok=True)

    if current_user.profile_photo_url and current_user.profile_photo_url.startswith("/static/profile_pictures/"):
        old_path = current_user.profile_photo_url.lstrip("/")
        if os.path.exists(old_path):
            os.remove(old_path)

    ext = ALLOWED_IMAGE_TYPES[file.content_type]
    filename = f"{current_user.id}_{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(PROFILE_PICTURE_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    current_user.profile_photo_url = f"/static/profile_pictures/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/me/profile-picture", response_model=UserOut)
def delete_profile_picture(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.profile_photo_url and current_user.profile_photo_url.startswith("/static/profile_pictures/"):
        old_path = current_user.profile_photo_url.lstrip("/")
        if os.path.exists(old_path):
            os.remove(old_path)

    current_user.profile_photo_url = None
    db.commit()
    db.refresh(current_user)
    return current_user


@router.patch("/me/change-password")
def change_password(
    payload: ChangePassword,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.password = hash_password(payload.new_password)
    db.commit()

    return {"message": "Password changed successfully"}


@router.get("/", response_model=list[UserOut])
def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return db.query(User).offset(skip).limit(limit).all()


@router.get("/{id}", response_model=UserOut)
def get_user_detail(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {id} not found",
        )
    return user


@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateByManager,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    existing_username = db.query(User).filter(User.username == payload.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )

    new_user = User(
        email=payload.email,
        username=payload.username,
        password=hash_password(payload.password),
        role=payload.role,
        name=payload.name,
        phone_number=payload.phone_number,
        job_title=payload.job_title,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.patch("/{id}", response_model=UserOut)
@router.put("/{id}", response_model=UserOut)
def update_user(
    id: int,
    payload: UserUpdateByManager,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    data = payload.model_dump(exclude_unset=True)

    if "email" in data and data["email"] is not None:
        existing = db.query(User).filter(User.email == data["email"], User.id != id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

    if "username" in data:
        new_username = data.pop("username")
        if new_username:
            existing = db.query(User).filter(User.username == new_username, User.id != id).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already taken",
                )
            user.username = new_username

    if "password" in data:
        pw = data.pop("password")
        if pw:
            user.password = hash_password(pw)

    for field, value in data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    if current_user.id == id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    db.delete(user)
    db.commit()
    return None


@router.patch("/{id}/deactivate", response_model=UserOut)
def deactivate_user(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    if current_user.id == id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if user.role == "deactivated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already deactivated",
        )
    user.previous_role = user.role
    user.role = "deactivated"
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{id}/activate", response_model=UserOut)
def activate_user(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if user.role != "deactivated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not deactivated",
        )
    user.role = user.previous_role or "care_worker"
    user.previous_role = None
    db.commit()
    db.refresh(user)
    return user


class ResetPasswordPayload(BaseModel):
    new_password: str


@router.patch("/{id}/reset-password")
def reset_user_password(
    id: int,
    payload: ResetPasswordPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )
    user.password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password reset successfully"}