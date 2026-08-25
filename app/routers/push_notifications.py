from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.cores.database import get_db
from app.cores.security import get_current_user
from app.models.device_token import DeviceToken
from app.models.user import User
from app.schemas.push_notification import DeviceTokenRegister, DeviceTokenUnregister, DeviceTokenOut

router = APIRouter(prefix="/notifications/push", tags=["Push Notifications"])


@router.post("/register-device", response_model=DeviceTokenOut, status_code=status.HTTP_200_OK)
def register_device(
    payload: DeviceTokenRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Registers or updates a device push token for the authenticated user.

    If the token already exists under another user (e.g. account switch on same device),
    it is reassigned to the current user to prevent duplicate notifications.
    """
    now = datetime.now(timezone.utc)
    
    # Check if this token is already registered in the system
    existing_token = (
        db.query(DeviceToken)
        .filter(DeviceToken.push_token == payload.push_token)
        .first()
    )

    if existing_token:
        # Reassign to current user if it belongs to someone else
        if existing_token.user_id != current_user.id:
            existing_token.user_id = current_user.id
            
        existing_token.platform = payload.platform
        existing_token.device_id = payload.device_id
        existing_token.is_active = True
        existing_token.updated_at = now
        
        db.commit()
        db.refresh(existing_token)
        return existing_token
    else:
        # Create new token registration
        new_token = DeviceToken(
            user_id=current_user.id,
            push_token=payload.push_token,
            platform=payload.platform,
            device_id=payload.device_id,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(new_token)
        db.commit()
        db.refresh(new_token)
        return new_token


@router.post("/unregister-device", status_code=status.HTTP_200_OK)
def unregister_device(
    payload: DeviceTokenUnregister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deactivates a device push token when the user logs out or disables notifications."""
    token = (
        db.query(DeviceToken)
        .filter(
            DeviceToken.push_token == payload.push_token,
            DeviceToken.user_id == current_user.id
        )
        .first()
    )
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Push token not found for current user",
        )
        
    token.is_active = False
    token.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": "Device token unregistered successfully"}
