from fastapi import APIRouter, Depends, HTTPException, Query, status
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
)

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserOut)
def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
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

    new_user = User(
        email=payload.email,
        password=hash_password(payload.password),
        role=payload.role,
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

    if payload.email is not None:
        existing = db.query(User).filter(User.email == payload.email, User.id != id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        user.email = payload.email

    if payload.role is not None:
        user.role = payload.role

    if payload.password is not None:
        user.password = hash_password(payload.password)

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