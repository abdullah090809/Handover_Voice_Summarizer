import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Protocol
logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.cores.database import get_db
from app.cores.limiter import limiter
from app.cores.security import (
    create_access_token,
    generate_otp,
    get_otp_expiry,
    hash_password,
    verify_password,
)
from app.models.password_reset import PasswordReset
from app.models.pending_user import PendingUser
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import (
    ForgotPassword,
    ResendOTP,
    ResetPassword,
    UserCreate,
    UserOut,
    VerifyOTP,
)
from app.services.email import send_password_reset_email, send_verification_email

router = APIRouter(tags=["Auth"])

MAX_OTP_REQUESTS_PER_DAY = 5

class _OtpRateLimited(Protocol):
    otp_request_count: int
    otp_window_start: datetime


def _check_and_increment_otp_limit(record: _OtpRateLimited, error_detail: str) -> None:
    now = datetime.now(timezone.utc)
    window_start = record.otp_window_start
    if window_start.tzinfo is None:
        window_start = window_start.replace(tzinfo=timezone.utc)

    if now - window_start > timedelta(hours=24):
        record.otp_request_count = 1
        record.otp_window_start = now
    elif record.otp_request_count >= MAX_OTP_REQUESTS_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error_detail,
        )
    else:
        record.otp_request_count += 1


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, user: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    existing_pending = db.query(PendingUser).filter(PendingUser.email == user.email).first()
    hashed_password = hash_password(user.password)

    if existing_pending:
        _check_and_increment_otp_limit(
            existing_pending,
            "Too many verification code requests today. Please try again tomorrow.",
        )
        otp_code = generate_otp()
        existing_pending.password = hashed_password
        existing_pending.otp_code = otp_code
        existing_pending.otp_expires_at = get_otp_expiry()
        db.commit()
    else:
        otp_code = generate_otp()
        new_pending = PendingUser(
            email=user.email,
            password=hashed_password,
            otp_code=otp_code,
            otp_expires_at=get_otp_expiry(),
        )
        db.add(new_pending)
        db.commit()

    try:
        send_verification_email(to_email=user.email, otp_code=otp_code)
    except Exception as e:
        logger.error(f"Failed to send verification email: {e}")

    return {"message": "Verification code sent to your email"}


@router.post("/resend-otp")
@limiter.limit("5/minute")
def resend_otp(request: Request, payload: ResendOTP, db: Session = Depends(get_db)):
    pending = db.query(PendingUser).filter(PendingUser.email == payload.email).first()

    if not pending:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending registration found for this email",
        )

    _check_and_increment_otp_limit(
        pending,
        "Too many verification code requests today. Please try again tomorrow.",
    )

    otp_code = generate_otp()
    pending.otp_code = otp_code
    pending.otp_expires_at = get_otp_expiry()
    db.commit()

    try:
        send_verification_email(to_email=payload.email, otp_code=otp_code)
    except Exception as e:
        logger.error(f"Failed to send verification email: {e}")

    return {"message": "Verification code resent to your email"}


@router.post("/verify", response_model=UserOut)
@limiter.limit("10/minute")
def verify_email(request: Request, payload: VerifyOTP, db: Session = Depends(get_db)):
    pending = db.query(PendingUser).filter(PendingUser.email == payload.email).first()

    if not pending:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending registration found for this email",
        )
    if not hmac.compare_digest(pending.otp_code, payload.otp_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code",
        )

    otp_expires_at = pending.otp_expires_at
    if otp_expires_at.tzinfo is None:
        otp_expires_at = otp_expires_at.replace(tzinfo=timezone.utc)

    if otp_expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired, please request a new one",
        )

    new_user = User(
        email=pending.email,
        password=pending.password,
        role=pending.role,
    )
    db.add(new_user)
    db.delete(pending)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, payload: ForgotPassword, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        return {"message": "If that email is registered, a reset code has been sent"}

    existing_reset = db.query(PasswordReset).filter(PasswordReset.email == payload.email).first()
    otp_code = generate_otp()

    if existing_reset:
        _check_and_increment_otp_limit(
            existing_reset,
            "Too many password reset requests today. Please try again tomorrow.",
        )
        existing_reset.otp_code = otp_code
        existing_reset.otp_expires_at = get_otp_expiry()
        db.commit()
    else:
        new_reset = PasswordReset(
            email=payload.email,
            otp_code=otp_code,
            otp_expires_at=get_otp_expiry(),
        )
        db.add(new_reset)
        db.commit()

    try:
        send_password_reset_email(to_email=payload.email, otp_code=otp_code)
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")

    return {"message": "If that email is registered, a reset code has been sent"}


@router.post("/reset-password")
@limiter.limit("10/minute")
def reset_password(request: Request, payload: ResetPassword, db: Session = Depends(get_db)):
    reset = db.query(PasswordReset).filter(PasswordReset.email == payload.email).first()

    if not reset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset code",
        )
    if not hmac.compare_digest(reset.otp_code, payload.otp_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset code",
        )

    otp_expires_at = reset.otp_expires_at
    if otp_expires_at.tzinfo is None:
        otp_expires_at = otp_expires_at.replace(tzinfo=timezone.utc)

    if otp_expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset code has expired, please request a new one",
        )

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.password = hash_password(payload.new_password)
    db.delete(reset)
    db.commit()

    return {"message": "Password reset successfully"}


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(
    request: Request,
    user_credentials: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == user_credentials.username).first()

    if not user or not verify_password(user_credentials.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.role == "deactivated":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Contact your manager.",
        )
    access_token = create_access_token(data={"user_id": str(user.id)})

    return {"access_token": access_token, "token_type": "bearer"}
