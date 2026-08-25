from sqlalchemy import Column, ForeignKey, Integer, String, Boolean, TIMESTAMP, UniqueConstraint
from sqlalchemy.sql.expression import text

from app.cores.database import Base


class DeviceToken(Base):
    """Stores Expo push tokens for mobile push notification delivery.

    Each row represents a single device registration for a single user.
    A user may have multiple active tokens (multiple devices), and a
    single push_token must belong to exactly one user at any time
    (enforced by the unique constraint on push_token — if a user switches
    accounts on the same device, the existing row is reassigned rather
    than duplicated).
    """

    __tablename__ = "device_tokens"

    id = Column(Integer, primary_key=True, nullable=False)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    push_token = Column(String, nullable=False, unique=True)
    platform = Column(String, nullable=True)  # "ios" / "android" / null
    device_id = Column(String, nullable=True)  # optional device identifier
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    last_used_at = Column(TIMESTAMP(timezone=True), nullable=True)
