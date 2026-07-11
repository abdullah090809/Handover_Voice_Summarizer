from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.cores.database import get_db
from app.cores.security import get_current_user
from app.models.care_home import CareHome
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
    care_home = db.query(CareHome).filter(CareHome.id == resident.care_home_id).first()
    if not care_home:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Care home with id {resident.care_home_id} not found",
        )

    # Issue #2 fix: a non-manager may only create residents in their own care home.
    if current_user.role != "manager" and resident.care_home_id != current_user.care_home_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to add residents to this care home",
        )

    new_resident = Resident(**resident.model_dump())
    db.add(new_resident)
    db.commit()
    db.refresh(new_resident)
    return new_resident


@router.get("/", response_model=list[ResidentOut])
def list_residents(
    # Issue #11 fix: bounded pagination.
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Issue #2 fix: scope non-managers to their own care home instead of
    # returning every resident in the system.
    query = db.query(Resident)
    if current_user.role != "manager":
        query = query.filter(Resident.care_home_id == current_user.care_home_id)
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

    # Issue #2 fix: deny access to residents outside the caller's care home.
    if current_user.role != "manager" and resident.care_home_id != current_user.care_home_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this resident",
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

    # Issue #2 fix: deny cross-care-home updates for non-managers.
    if current_user.role != "manager" and resident.care_home_id != current_user.care_home_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this resident",
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

    # Issue #2 fix: deny cross-care-home deletes for non-managers.
    if current_user.role != "manager" and resident.care_home_id != current_user.care_home_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this resident",
        )

    resident_query.delete(synchronize_session=False)
    db.commit()

    return None
