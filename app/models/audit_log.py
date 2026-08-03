from sqlalchemy import Column, Integer, String, DateTime, Text, func
from app.cores.database import Base


class AuditLog(Base):
    """Append-only audit log.

    This table must NEVER be updated or deleted — only INSERTs are allowed.
    Use the database-level permissions (REVOKE UPDATE, DELETE ON audit_logs) in
    production to enforce this at the DB layer as well.
    """

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Who performed the action (null for anonymous/unauthenticated requests)
    user_id = Column(Integer, nullable=True)
    user_role = Column(String(50), nullable=True)

    # What was done
    method = Column(String(10), nullable=False)       # GET, POST, PATCH, DELETE …
    path = Column(String(500), nullable=False)         # URL path
    status_code = Column(Integer, nullable=True)       # HTTP response code
    duration_ms = Column(Integer, nullable=True)       # wall-clock request time

    # Extra detail for sensitive mutations
    detail = Column(Text, nullable=True)
