from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql.expression import text
from sqlalchemy.sql.sqltypes import TIMESTAMP

from app.cores.database import Base


class HandoverNote(Base):
    __tablename__ = "handover_notes"

    id = Column(Integer, primary_key=True, nullable=False)
    shift_id = Column(
        Integer, ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False
    )
    resident_id = Column(
        Integer, ForeignKey("residents.id", ondelete="SET NULL"), nullable=True
    )
    raw_transcript = Column(String, nullable=False)
    summary_json = Column(JSONB, nullable=False)
    urgency_flag = Column(String, nullable=False)
    created_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )