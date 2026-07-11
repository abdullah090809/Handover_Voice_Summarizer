from sqlalchemy import Column, ForeignKey, Integer, TIMESTAMP

from app.cores.database import Base


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, nullable=False)
    # Issue #10 fix: index the FK — every shift query in shifts.py/handover.py
    # filters on worker_id.
    worker_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    end_time = Column(TIMESTAMP(timezone=True), nullable=True)
