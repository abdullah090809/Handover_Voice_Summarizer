from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.cores.database import get_db
from app.cores.security import get_current_user
from app.models.resident import Resident
from app.models.user import User
from app.schemas.resident import ResidentCreate, ResidentOut

router = APIRouter(prefix="/residents", tags=["Residents"])


@router.post("/", response_model=ResidentOut, status_code=status.HTTP_201_CREATED)
def create_resident(
    resident: ResidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_resident = Resident(**resident.model_dump())
    db.add(new_resident)
    db.commit()
    db.refresh(new_resident)
    return new_resident


@router.get("/", response_model=list[ResidentOut])
def list_residents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Resident).all()


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
    current_user: User = Depends(get_current_user),
):
    resident_query = db.query(Resident).filter(Resident.id == id)
    resident = resident_query.first()

    if not resident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resident with id {id} not found",
        )

    resident_query.update(updated_resident.model_dump(), synchronize_session=False)
    db.commit()

    return resident_query.first()


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resident(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resident_query = db.query(Resident).filter(Resident.id == id)
    resident = resident_query.first()

    if not resident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resident with id {id} not found",
        )

    resident_query.delete(synchronize_session=False)
    db.commit()

    return None