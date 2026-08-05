import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.cores.database import get_db
from app.cores.security import get_current_user, require_manager
from app.models.notification import Notification
from app.models.resident import Resident
from app.models.user import User
from app.routers.websocket import manager
from app.schemas.resident import (
    ResidentCreate,
    ResidentOut,
    ResidentStatusUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/residents", tags=["Residents"])


@router.post("/", response_model=ResidentOut, status_code=status.HTTP_201_CREATED)
def create_resident(
    resident: ResidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    new_resident = Resident(**resident.model_dump())
    db.add(new_resident)
    db.commit()
    db.refresh(new_resident)
    return new_resident


@router.get("/", response_model=list[ResidentOut])
def list_residents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Resident)

    if current_user.role != "manager":
        query = query.filter(Resident.status == "active")
    elif not include_inactive:
        query = query.filter(Resident.status == "active")

    return query.offset(skip).limit(limit).all()


@router.get("/{id}", response_model=ResidentOut)
def get_resident(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resident = db.query(Resident).filter(Resident.id == id).first()

    if not resident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resident with id {id} not found",
        )

    return resident


@router.put("/{id}", response_model=ResidentOut)
def update_resident(
    id: int,
    updated_resident: ResidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    resident = db.query(Resident).filter(Resident.id == id).first()

    if not resident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resident with id {id} not found",
        )

    # SQLAlchemy 2.x style update
    for field, value in updated_resident.model_dump().items():
        setattr(resident, field, value)

    db.commit()
    db.refresh(resident)

    return resident


@router.patch("/{id}/status", response_model=ResidentOut)
async def update_resident_status(
    id: int,
    payload: ResidentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    resident = db.query(Resident).filter(Resident.id == id).first()

    if not resident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resident with id {id} not found",
        )

    old_status = resident.status
    resident.status = payload.status

    if payload.status == "active":
        resident.discharged_at = None
    else:
        resident.discharged_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(resident)

    if old_status != payload.status and payload.status in ("discharged", "deceased"):
        msg = f"Resident {resident.name} status updated to {payload.status}."

        notification = Notification(
            message=msg,
            urgency_flag="high",
            resident_id=resident.id,
        )

        db.add(notification)
        db.commit()
        db.refresh(notification)

        try:
            await manager.broadcast(
                json.dumps(
                    {
                        "type": "notification",
                        "id": notification.id,
                        "message": msg,
                        "urgency_flag": "high",
                        "resident_id": resident.id,
                    }
                )
            )
        except Exception:
            logger.exception(
                "Failed to broadcast resident status update websocket notification"
            )

    return resident


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resident(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    resident = db.query(Resident).filter(Resident.id == id).first()

    if not resident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resident with id {id} not found",
        )

    db.delete(resident)
    db.commit()

    return None