"""
Audit logging middleware.

Logs every mutating request (non-GET, non-HEAD, non-OPTIONS) to the
append-only audit_logs table.  Reads-only endpoints are excluded to avoid
write amplification on high-frequency poll/list endpoints.

Sensitive mutations (auth routes, role changes, deletions) are always logged
regardless of method.
"""

import logging
import time

from fastapi import Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.cores.config import settings
from app.cores.database import SessionLocal
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# Always audit these path prefixes regardless of method
_ALWAYS_AUDIT_PREFIXES = ("/login", "/register", "/verify", "/resend-otp",
                          "/forgot-password", "/reset-password")

# Never audit these prefixes (health / metrics / docs)
_SKIP_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json", "/favicon")


def _extract_user_from_request(request: Request) -> tuple[int | None, str | None]:
    """Best-effort JWT extraction — never raises."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return None, None
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        user_id = payload.get("user_id")
        user_role = payload.get("role")
        return user_id, user_role
    except (JWTError, Exception):
        return None, None


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        method = request.method

        # Skip health checks, docs, and pure reads unless always-audited
        should_skip = any(path.startswith(p) for p in _SKIP_PREFIXES)
        is_read = method in ("GET", "HEAD", "OPTIONS")
        always_audit = any(path.startswith(p) for p in _ALWAYS_AUDIT_PREFIXES)

        if should_skip or (is_read and not always_audit):
            return await call_next(request)

        user_id, user_role = _extract_user_from_request(request)
        start = time.monotonic()

        response: Response = await call_next(request)

        duration_ms = int((time.monotonic() - start) * 1000)

        # Fire-and-forget DB write (best effort — never fails the request)
        try:
            db: Session = SessionLocal()
            try:
                entry = AuditLog(
                    user_id=user_id,
                    user_role=user_role,
                    method=method,
                    path=path,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )
                db.add(entry)
                db.commit()
            finally:
                db.close()
        except Exception:
            logger.exception("AuditLogMiddleware: failed to write audit entry")

        return response
