from sqlalchemy import Column, ForeignKey, Integer, String, Boolean, TIMESTAMP
from sqlalchemy.sql.expression import text

from app.cores.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, nullable=False)
    message = Column(String, nullable=False)
    urgency_flag = Column(String, nullable=True, index=True)
    resident_id = Column(
        Integer,
        ForeignKey("residents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    handover_note_id = Column(
        Integer,
        ForeignKey("handover_notes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    is_read = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
