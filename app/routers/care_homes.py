from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.cores.database import get_db
from app.cores.security import get_current_user
from app.models.care_home import CareHome
from app.models.user import User
from app.schemas.care_home import CareHomeCreate, CareHomeOut

router = APIRouter(prefix="/care-homes", tags=["Care Homes"])


@router.post("/", response_model=CareHomeOut, status_code=status.HTTP_201_CREATED)
def create_care_home(
    care_home: CareHomeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_care_home = CareHome(**care_home.model_dump())
    db.add(new_care_home)
    db.commit()
    db.refresh(new_care_home)
    return new_care_home


@router.get("/", response_model=list[CareHomeOut])
def list_care_homes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers can view all care homes",
        )
    return db.query(CareHome).all()


@router.get("/{id}", response_model=CareHomeOut)
def get_care_home(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    care_home = db.query(CareHome).filter(CareHome.id == id).first()
    if not care_home:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Care home with id {id} not found",
        )
    return care_home


@router.put("/{id}", response_model=CareHomeOut)
def update_care_home(
    id: int,
    updated_care_home: CareHomeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    care_home_query = db.query(CareHome).filter(CareHome.id == id)
    care_home = care_home_query.first()

    if not care_home:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Care home with id {id} not found",
        )

    care_home_query.update(updated_care_home.model_dump(), synchronize_session=False)
    db.commit()

    return care_home_query.first()


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_care_home(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    care_home_query = db.query(CareHome).filter(CareHome.id == id)
    care_home = care_home_query.first()

    if not care_home:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Care home with id {id} not found",
        )

    care_home_query.delete(synchronize_session=False)
    db.commit()

    return None