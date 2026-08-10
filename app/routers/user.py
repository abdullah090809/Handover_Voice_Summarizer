import os
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from app.cores.database import get_db
from app.cores.security import get_current_user, hash_password, verify_password, require_manager, blocklist_token, clear_token_blocklist
from app.models.assignment import ResidentAssignment
from app.models.resident import Resident
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Re-query with the same eager-loading as list_users/get_user_detail so
    # the profile page (assigned residents / managed care workers /
    # residents overseen) doesn't fire a cascade of lazy queries. Cheap
    # here since it's always exactly one row.
    return (
        db.query(User)
        .options(
            selectinload(User.manager),
            selectinload(User.assigned_residents),
            selectinload(User.managed_care_workers).selectinload(User.assigned_residents),
        )
        .filter(User.id == current_user.id)
        .first()
    )


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

    os.makedirs(PROFILE_PICTURE_DIR, exist_ok=True)

    # Write the NEW file first. Only once it's fully written, size-validated,
    # and the DB commit succeeds do we touch the old file. This way a dropped
    # connection, an oversized upload, or a DB error never leaves the user
    # with no profile picture at all — the previous one stays intact.
    ext = ALLOWED_IMAGE_TYPES[file.content_type]
    filename = f"{current_user.id}_{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(PROFILE_PICTURE_DIR, filename)
    previous_url = current_user.profile_photo_url

    size = 0
    _CHUNK_SIZE = 1024 * 1024  # 1 MB chunk size
    try:
        with open(filepath, "wb") as f:
            while chunk := await file.read(_CHUNK_SIZE):
                size += len(chunk)
                if size > MAX_PROFILE_PICTURE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Image must be smaller than 5MB",
                    )
                f.write(chunk)

        current_user.profile_photo_url = f"/static/profile_pictures/{filename}"
        db.commit()
        db.refresh(current_user)
    except Exception:
        # New file failed validation, or the DB commit failed — clean up the
        # partial/rejected upload and leave the user's existing photo alone.
        if os.path.exists(filepath):
            os.remove(filepath)
        db.rollback()
        raise

    # Only now, after the new photo is confirmed saved, remove the old one.
    if previous_url and previous_url.startswith("/static/profile_pictures/"):
        old_path = previous_url.lstrip("/")
        if os.path.exists(old_path):
            os.remove(old_path)

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
    # pyrefly: ignore [bad-argument-type]
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
    # Stage 6: UserOut serializes manager, assigned_residents, and
    # managed_care_workers on every row. All three default to lazy="select"
    # (see the loading-strategy note in app/models/user.py), so without
    # this a page of N users fires up to 3N extra queries. selectinload()
    # batches each relationship into one extra query for the whole page.
    # These are query-time options, not a change to the relationships'
    # own default -- they don't cascade into eager-loading e.g. each
    # managed care worker's own assigned_residents in turn.
    return (
        db.query(User)
        .options(
            selectinload(User.manager),
            selectinload(User.assigned_residents),
            # residents_overseen (a manager property) walks
            # managed_care_workers -> each worker's own assigned_residents,
            # so eager-load that second hop too, or it falls back to one
            # lazy query per managed care worker per row.
            selectinload(User.managed_care_workers).selectinload(User.assigned_residents),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{id}", response_model=UserOut)
def get_user_detail(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    user = (
        db.query(User)
        .options(
            selectinload(User.manager),
            selectinload(User.assigned_residents),
            selectinload(User.managed_care_workers).selectinload(User.assigned_residents),
        )
        .filter(User.id == id)
        .first()
    )
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

    if payload.employee_id:
        existing_employee_id = db.query(User).filter(User.employee_id == payload.employee_id).first()
        if existing_employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee ID already in use",
            )

    extra_fields = payload.model_dump(
        exclude={"email", "username", "password", "role", "name", "phone_number", "job_title"},
        exclude_unset=True,
    )

    new_user = User(
        email=payload.email,
        username=payload.username,
        password=hash_password(payload.password),
        role=payload.role,
        name=payload.name,
        phone_number=payload.phone_number,
        job_title=payload.job_title,
        **extra_fields,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Auto-generate a human-facing employee ID once we know the row's id,
    # unless the manager already supplied their own scheme on create.
    # Prefix distinguishes the two roles that share this one `users` table
    # (see global search's identifier scheme: EMP- for care workers,
    # MGR- for managers) -- both still number off the same row id.
    if not new_user.employee_id:
        prefix = "MGR" if new_user.role == "manager" else "EMP"
        new_user.employee_id = f"{prefix}-{new_user.id:04d}"
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

    if "employee_id" in data and data["employee_id"]:
        existing = db.query(User).filter(User.employee_id == data["employee_id"], User.id != id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee ID already in use",
            )

    previous_employment_status = user.employment_status

    for field, value in data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    # Mirror the deactivate/activate blocklist behaviour (see below) for the
    # "left" employment status: get_current_user() already re-checks this
    # column on every request, but blocklisting here revokes any in-flight
    # token immediately instead of waiting for its next DB round-trip, and
    # keeps both revocation paths consistent.
    if user.employment_status == "left" and previous_employment_status != "left":
        # pyrefly: ignore [bad-argument-type]
        blocklist_token(user.id)
    elif previous_employment_status == "left" and user.employment_status != "left":
        # pyrefly: ignore [bad-argument-type]
        clear_token_blocklist(user.id)

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

    # Stage 6: a care worker with active residents still relies on someone
    # covering that caseload. Rather than silently detaching their
    # assignments (which would leave those residents unassigned with no
    # record of who picks them up), block the deactivation and require the
    # manager to reassign the caseload first.
    if user.role == "care_worker":
        active_resident_count = (
            db.query(Resident)
            .join(
                ResidentAssignment,
                ResidentAssignment.resident_id == Resident.id,
            )
            .filter(
                ResidentAssignment.care_worker_id == user.id,
                Resident.status == "active",
            )
            .count()
        )
        if active_resident_count:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot deactivate this care worker: they still have "
                    f"{active_resident_count} active resident(s) assigned. "
                    "Reassign their caseload first."
                ),
            )

    user.previous_role = user.role
    user.role = "deactivated"
    db.commit()
    db.refresh(user)
    # Immediately revoke all active tokens for this user via Redis blocklist
    # pyrefly: ignore [bad-argument-type]
    blocklist_token(user.id)
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
    # Undo the deactivation-time blocklist entry. Without this, the block
    # is keyed only by user_id (not by when the token was issued), so it
    # would keep rejecting this user's requests -- including a fresh
    # login's new token -- until the original TTL ran out on its own.
    clear_token_blocklist(user.id)
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