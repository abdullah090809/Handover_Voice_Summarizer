from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.cores.database import get_db
from app.cores.security import require_manager
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationOut

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/", response_model=list[NotificationOut])
def list_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return (
        db.query(Notification)
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.patch("/{id}/read", response_model=NotificationOut)
def mark_as_read(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    notification = db.query(Notification).filter(Notification.id == id).first()
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/read-all", status_code=status.HTTP_200_OK)
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    db.query(Notification).filter(Notification.is_read == False).update(
        {"is_read": True}, synchronize_session=False
    )
    db.commit()
    return {"message": "All notifications marked as read."}
