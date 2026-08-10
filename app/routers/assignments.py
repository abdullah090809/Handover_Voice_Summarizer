
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.routers import auth, handover, residents, shifts, user, websocket, notifications, audit, assignments
from app.routers.websocket import manager as ws_manager
from app.cores.database import get_db
from app.cores.security import get_current_user, require_manager
from app.models.assignment import ResidentAssignment
from app.models.notification import Notification
from app.models.resident import Resident
from app.models.user import User
from app.schemas.assignment import (
    AssignedResidentBrief,
    AssignedUserBrief,
    CareWorkerResidentAssignmentUpdate,
    ManagerAssignmentUpdate,
    ResidentCareWorkerAssignmentUpdate,
)
from app.schemas.resident import ResidentOut
from app.schemas.user import UserOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assignments", tags=["Assignments"])


# ---------------------------------------------------------------------------
# Notifications for assignment changes (Stage 6)
# ---------------------------------------------------------------------------
# Mirrors the pattern already used for resident discharge/death in
# routers/residents.py: create a Notification row, then best-effort
# broadcast it over the websocket. Assignment-change notifications are
# informational rather than urgent, so urgency_flag is left unset (None),
# unlike the "high" used for discharge/death.


async def _notify_assignment_change(
    db: Session, message: str, *, resident_id: int | None = None
) -> None:
    notification = Notification(
        message=message,
        resident_id=resident_id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    try:
        await ws_manager.broadcast(
            json.dumps(
                {
                    "type": "notification",
                    "id": notification.id,
                    "message": message,
                    "urgency_flag": None,
                    "resident_id": resident_id,
                }
            )
        )
    except Exception:
        logger.exception(
            "Failed to broadcast assignment-change websocket notification"
        )


def _display_name(u: User) -> str:
    return u.name or u.username


# ---------------------------------------------------------------------------
# Shared lookups / validation helpers
# ---------------------------------------------------------------------------


def _get_resident_or_404(db: Session, resident_id: int) -> Resident:
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resident with id {resident_id} not found",
        )
    return resident


def _get_care_worker_or_404(db: Session, care_worker_id: int) -> User:
    worker = db.query(User).filter(User.id == care_worker_id).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {care_worker_id} not found",
        )
    if worker.role != "care_worker":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"User {worker.id} has role '{worker.role}', not "
                "'care_worker' -- only care workers can be assigned to "
                "residents or to a manager"
            ),
        )
    return worker


def _get_manager_or_404(db: Session, manager_id: int) -> User:
    manager = db.query(User).filter(User.id == manager_id).first()
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {manager_id} not found",
        )
    if manager.role != "manager":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User {manager.id} has role '{manager.role}', not 'manager'",
        )
    return manager


def _require_self_or_manager(current_user: User, target_user_id: int) -> None:
    """Read-endpoint gate: managers can view anyone's assignments; anyone
    else may only view their own."""
    if current_user.role != "manager" and current_user.id != target_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only view your own assignments",
        )


# ---------------------------------------------------------------------------
# Resident <-> Care Worker
# ---------------------------------------------------------------------------


@router.post(
    "/residents/{resident_id}/care-workers/{care_worker_id}",
    response_model=ResidentOut,
    status_code=status.HTTP_201_CREATED,
)
async def assign_care_worker_to_resident(
    resident_id: int,
    care_worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Assign a single care worker to a resident (additive -- existing
    assignments for this resident are untouched)."""
    resident = _get_resident_or_404(db, resident_id)
    worker = _get_care_worker_or_404(db, care_worker_id)

    existing = (
        db.query(ResidentAssignment)
        .filter(
            ResidentAssignment.resident_id == resident.id,
            ResidentAssignment.care_worker_id == worker.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Care worker {worker.id} is already assigned to resident {resident.id}",
        )

    link = ResidentAssignment(
        resident_id=resident.id,
        care_worker_id=worker.id,
        assigned_by_id=current_user.id,
    )
    db.add(link)
    db.commit()
    db.refresh(resident)

    await _notify_assignment_change(
        db,
        f"{_display_name(worker)} was assigned to {resident.name}.",
        resident_id=resident.id,
    )
    return resident


@router.delete(
    "/residents/{resident_id}/care-workers/{care_worker_id}",
    response_model=ResidentOut,
)
async def remove_care_worker_from_resident(
    resident_id: int,
    care_worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Remove a single resident <-> care worker assignment."""
    resident = _get_resident_or_404(db, resident_id)
    worker = db.query(User).filter(User.id == care_worker_id).first()

    link = (
        db.query(ResidentAssignment)
        .filter(
            ResidentAssignment.resident_id == resident_id,
            ResidentAssignment.care_worker_id == care_worker_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Care worker {care_worker_id} is not assigned to resident {resident_id}",
        )

    db.delete(link)
    db.commit()
    db.refresh(resident)

    worker_label = _display_name(worker) if worker else f"Care worker {care_worker_id}"
    await _notify_assignment_change(
        db,
        f"{worker_label} was unassigned from {resident.name}.",
        resident_id=resident.id,
    )
    return resident


@router.put(
    "/residents/{resident_id}/care-workers",
    response_model=ResidentOut,
)
async def set_resident_care_workers(
    resident_id: int,
    payload: ResidentCareWorkerAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Reassign: replace this resident's *entire* set of assigned care
    workers with the given list in one call. An empty list clears all of
    the resident's assignments."""
    resident = _get_resident_or_404(db, resident_id)

    # Validate every target id up front (dedup with a set) so a bad id
    # anywhere in the payload fails the whole request instead of leaving a
    # half-applied assignment set.
    new_worker_ids = set(payload.care_worker_ids)
    for worker_id in new_worker_ids:
        _get_care_worker_or_404(db, worker_id)

    existing_links = (
        db.query(ResidentAssignment)
        .filter(ResidentAssignment.resident_id == resident.id)
        .all()
    )
    existing_worker_ids = {link.care_worker_id for link in existing_links}

    added_ids = new_worker_ids - existing_worker_ids
    removed_ids = existing_worker_ids - new_worker_ids

    # Remove links no longer in the new set.
    for link in existing_links:
        if link.care_worker_id not in new_worker_ids:
            db.delete(link)

    # Add links that are new.
    for worker_id in added_ids:
        db.add(
            ResidentAssignment(
                resident_id=resident.id,
                care_worker_id=worker_id,
                assigned_by_id=current_user.id,
            )
        )

    db.commit()
    db.refresh(resident)

    if added_ids or removed_ids:
        workers_by_id = {
            w.id: w
            for w in db.query(User).filter(User.id.in_(added_ids | removed_ids)).all()
        }
        added_names = [
            _display_name(workers_by_id[i]) for i in added_ids if i in workers_by_id
        ]
        removed_names = [
            _display_name(workers_by_id[i]) for i in removed_ids if i in workers_by_id
        ]
        parts = []
        if added_names:
            parts.append(f"assigned {', '.join(added_names)}")
        if removed_names:
            parts.append(f"unassigned {', '.join(removed_names)}")
        message = f"{resident.name}'s care workers updated: " + "; ".join(parts) + "."
        await _notify_assignment_change(db, message, resident_id=resident.id)

    return resident


@router.get(
    "/residents/{resident_id}/care-workers",
    response_model=list[AssignedUserBrief],
)
def list_resident_care_workers(
    resident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the care workers currently assigned to a resident. Open to any
    authenticated user (matches GET /residents/{id} visibility)."""
    resident = _get_resident_or_404(db, resident_id)
    return resident.assigned_care_workers


@router.put(
    "/care-workers/{care_worker_id}/residents",
    response_model=UserOut,
)
async def set_care_worker_residents(
    care_worker_id: int,
    payload: CareWorkerResidentAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Mirror of set_resident_care_workers, from the care worker's side:
    replace this care worker's entire caseload in one call. Convenient for
    the "assign several residents to one worker" workflow."""
    worker = _get_care_worker_or_404(db, care_worker_id)

    new_resident_ids = set(payload.resident_ids)
    for resident_id in new_resident_ids:
        _get_resident_or_404(db, resident_id)

    existing_links = (
        db.query(ResidentAssignment)
        .filter(ResidentAssignment.care_worker_id == worker.id)
        .all()
    )
    existing_resident_ids = {link.resident_id for link in existing_links}

    added_ids = new_resident_ids - existing_resident_ids
    removed_ids = existing_resident_ids - new_resident_ids

    for link in existing_links:
        if link.resident_id not in new_resident_ids:
            db.delete(link)

    for resident_id in added_ids:
        db.add(
            ResidentAssignment(
                resident_id=resident_id,
                care_worker_id=worker.id,
                assigned_by_id=current_user.id,
            )
        )

    db.commit()
    db.refresh(worker)

    if added_ids or removed_ids:
        residents_by_id = {
            r.id: r
            for r in db.query(Resident).filter(Resident.id.in_(added_ids | removed_ids)).all()
        }
        added_names = [
            residents_by_id[i].name for i in added_ids if i in residents_by_id
        ]
        removed_names = [
            residents_by_id[i].name for i in removed_ids if i in residents_by_id
        ]
        parts = []
        if added_names:
            parts.append(f"assigned {', '.join(added_names)}")
        if removed_names:
            parts.append(f"unassigned {', '.join(removed_names)}")
        message = (
            f"{_display_name(worker)}'s caseload updated: " + "; ".join(parts) + "."
        )
        await _notify_assignment_change(db, message)

    return worker


@router.get(
    "/care-workers/{care_worker_id}/residents",
    response_model=list[AssignedResidentBrief],
)
def list_care_worker_residents(
    care_worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the residents currently assigned to a care worker. Managers can
    view any worker's caseload; a care worker can view their own."""
    _require_self_or_manager(current_user, care_worker_id)
    worker = _get_care_worker_or_404(db, care_worker_id)
    return worker.assigned_residents


# ---------------------------------------------------------------------------
# Care Worker -> Manager
# ---------------------------------------------------------------------------


@router.patch(
    "/care-workers/{care_worker_id}/manager",
    response_model=UserOut,
)
async def assign_manager_to_care_worker(
    care_worker_id: int,
    payload: ManagerAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Assign, reassign, or remove a care worker's manager. Pass
    `manager_id: null` to remove the current assignment."""
    worker = _get_care_worker_or_404(db, care_worker_id)

    if payload.manager_id is None:
        worker.manager_id = None
        db.commit()
        db.refresh(worker)
        await _notify_assignment_change(
            db, f"{_display_name(worker)}'s manager was removed."
        )
    else:
        manager = _get_manager_or_404(db, payload.manager_id)
        worker.manager_id = manager.id
        db.commit()
        db.refresh(worker)
        await _notify_assignment_change(
            db,
            f"{_display_name(worker)} was assigned to manager {_display_name(manager)}.",
        )

    return worker


@router.get(
    "/managers/{manager_id}/care-workers",
    response_model=list[AssignedUserBrief],
)
def list_manager_care_workers(
    manager_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the care workers currently managed by a manager. Managers can
    view any manager's team; a manager can also view their own."""
    _require_self_or_manager(current_user, manager_id)
    manager = _get_manager_or_404(db, manager_id)
    return manager.managed_care_workers