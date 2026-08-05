import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.cores.database import get_db
from app.cores.security import require_manager
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogOut, AuditLogPagination

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit", tags=["Audit"])


def _attach_usernames(db: Session, entries: list[AuditLog]) -> list[AuditLogOut]:
    """Batch-resolve usernames for a page of audit entries.

    audit_logs.user_id is intentionally not a foreign key (the append-only
    log must still record activity for users that get deleted later), so we
    resolve usernames with a best-effort lookup rather than a join/relationship.
    """
    user_ids = {e.user_id for e in entries if e.user_id is not None}
    usernames: dict[int, str] = {}
    if user_ids:
        rows = (
            db.query(User.id, User.username)
            .filter(User.id.in_(user_ids))
            .all()
        )
        usernames = {row.id: row.username for row in rows}

    out: list[AuditLogOut] = []
    for entry in entries:
        item = AuditLogOut.model_validate(entry)
        if entry.user_id is not None:
            item.username = usernames.get(entry.user_id)  # pyrefly: ignore [bad-argument-type]
        out.append(item)
    return out


@router.get("/", response_model=AuditLogPagination)
def list_audit_logs(
    method: str | None = Query(None, description="Filter by HTTP method, e.g. POST"),
    user_id: int | None = Query(None, description="Filter by the user who performed the action"),
    path: str | None = Query(None, description="Substring match on the request path"),
    status_code: int | None = Query(None, description="Filter by HTTP response status code"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    query = db.query(AuditLog)

    if method is not None:
        query = query.filter(AuditLog.method == method.upper())
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if path is not None:
        query = query.filter(AuditLog.path.ilike(f"%{path}%"))
    if status_code is not None:
        query = query.filter(AuditLog.status_code == status_code)
    if date_from is not None:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to is not None:
        query = query.filter(AuditLog.created_at <= date_to)

    total = query.count()
    results = (
        query.order_by(AuditLog.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {"total": total, "results": _attach_usernames(db, results)}


@router.get("/{id}", response_model=AuditLogOut)
def get_audit_log(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    entry = db.query(AuditLog).filter(AuditLog.id == id).first()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit log with id {id} not found",
        )
    return _attach_usernames(db, [entry])[0]