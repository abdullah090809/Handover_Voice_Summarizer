from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql.expression import text
from sqlalchemy.sql.sqltypes import TIMESTAMP

from app.cores.database import Base


class HandoverNote(Base):
    __tablename__ = "handover_notes"

    id = Column(Integer, primary_key=True, nullable=False)
    # Issue #9 fix: RESTRICT instead of CASCADE — a handover/clinical note
    # must never be silently destroyed as a side effect of deleting the
    # shift it was recorded during.
    # Issue #10 fix: index the FK — filtered on in list_handover_notes.
    shift_id = Column(
        Integer,
        ForeignKey("shifts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Issue #10 fix: index — filtered on in list_handover_notes and in the
    # tenant-scoping join added for Issue #3.
    resident_id = Column(
        Integer,
        ForeignKey("residents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Issue #14 fix: these three fields are now populated asynchronously by a
    # background task after the row is created, so they must be nullable
    # while status="pending"/"processing".
    raw_transcript = Column(String, nullable=True)
    summary_json = Column(JSONB, nullable=True)
    urgency_flag = Column(String, nullable=True, index=True)
    # Issue #14 fix: processing status so the client can poll / the UI can
    # show "processing" instead of blocking the HTTP request on Whisper +
    # Gemini.
    status = Column(String, nullable=False, server_default="pending")
    error_message = Column(String, nullable=True)
    created_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
