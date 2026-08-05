from datetime import datetime
from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    created_at: datetime
    user_id: int | None
    user_role: str | None
    # Resolved from users table at read time (audit_logs only stores the
    # denormalized user_id/user_role captured at write time, so username is
    # not always populated — e.g. if the user was later deleted).
    username: str | None = None
    method: str
    path: str
    status_code: int | None
    duration_ms: int | None
    detail: str | None

    class Config:
        from_attributes = True


class AuditLogPagination(BaseModel):
    total: int
    results: list[AuditLogOut]
