from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.cores.database import get_db
from app.cores.security import get_current_user
from app.models.shift import Shift
from app.models.user import User
from app.schemas.shift import ShiftCreate, ShiftOut

router = APIRouter(prefix="/shifts", tags=["Shifts"])


@router.post("/", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
def create_shift(
    shift: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_shift = Shift(worker_id=current_user.id, **shift.model_dump())
    db.add(new_shift)
    db.commit()
    db.refresh(new_shift)
    return new_shift


@router.get("/", response_model=list[ShiftOut])
def list_my_shifts(
    worker_id: int | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if worker_id is not None:
        if current_user.role != "manager":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only managers can view other workers' shifts",
            )
        target_worker = db.query(User).filter(User.id == worker_id).first()
        if not target_worker:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Worker with id {worker_id} not found",
            )
        query_id = worker_id
    else:
        query_id = current_user.id

    return (
        db.query(Shift)
        .filter(Shift.worker_id == query_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{id}", response_model=ShiftOut)
def get_shift(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shift = db.query(Shift).filter(Shift.id == id).first()
    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shift with id {id} not found",
        )
    if shift.worker_id != current_user.id and current_user.role != "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this shift",
        )
    return shift


@router.put("/{id}", response_model=ShiftOut)
def update_shift(
    id: int,
    updated_shift: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shift_query = db.query(Shift).filter(Shift.id == id)
    shift = shift_query.first()

    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shift with id {id} not found",
        )
    if shift.worker_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this shift",
        )

    shift_query.update(updated_shift.model_dump(), synchronize_session=False)
    db.commit()

    return shift_query.first()


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shift_query = db.query(Shift).filter(Shift.id == id)
    shift = shift_query.first()

    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shift with id {id} not found",
        )
    if shift.worker_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this shift",
        )

    shift_query.delete(synchronize_session=False)
    db.commit()

    return None