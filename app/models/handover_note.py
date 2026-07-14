from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql.expression import text
from sqlalchemy.sql.sqltypes import TIMESTAMP

from app.cores.database import Base


class HandoverNote(Base):
    __tablename__ = "handover_notes"

    id = Column(Integer, primary_key=True, nullable=False)
    shift_id = Column(
        Integer,
        ForeignKey("shifts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    resident_id = Column(
        Integer,
        ForeignKey("residents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    raw_transcript = Column(String, nullable=True)
    summary_json = Column(JSONB, nullable=True)
    urgency_flag = Column(String, nullable=True, index=True)
    status = Column(String, nullable=False, server_default="pending")
    error_message = Column(String, nullable=True)
    created_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
