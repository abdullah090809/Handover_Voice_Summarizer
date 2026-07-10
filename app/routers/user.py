from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.cores.database import get_db
from app.cores.security import get_current_user, hash_password, verify_password
from app.models.care_home import CareHome
from app.models.user import User
from app.schemas.user import AssignCareHome, ChangePassword, UserOut

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


@router.patch("/{id}/care-home", response_model=UserOut)
def assign_care_home(
    id: int,
    assignment: AssignCareHome,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers can assign care homes to users",
        )

    user_query = db.query(User).filter(User.id == id)
    user = user_query.first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {id} not found",
        )

    care_home = db.query(CareHome).filter(CareHome.id == assignment.care_home_id).first()
    if not care_home:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Care home with id {assignment.care_home_id} not found",
        )

    user_query.update({"care_home_id": assignment.care_home_id}, synchronize_session=False)
    db.commit()

    return user_query.first()