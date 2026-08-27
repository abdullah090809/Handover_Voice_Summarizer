from sqlalchemy import Column, ForeignKey, Integer, String, TIMESTAMP
from sqlalchemy.orm import Session

from app.cores.database import Base


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, nullable=False)
    worker_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    end_time = Column(TIMESTAMP(timezone=True), nullable=True)
    # IANA timezone name (e.g. "Asia/Karachi", "America/New_York") captured
    # from the client's device/browser at clock-in. Lets
    # auto_clock_out_stale_shifts close a shift at *that worker's* local
    # midnight rather than one hardcoded zone -- correct regardless of
    # which country a care home operates in. Nullable: older rows created
    # before this column existed, or a client that failed to send one,
    # fall back to app.cores.config.settings.app_timezone (UTC by default).
    timezone = Column(String, nullable=True)


def compute_shift_numbers(db: Session, worker_ids: set[int]) -> dict[int, int]:
    """Maps shift.id -> that shift's 1-based position among its own worker's
    shifts, ordered by start_time (ties broken by id).

    `shifts.id` is a single Postgres sequence shared by every worker in the
    system, so from any one worker's point of view it can jump unpredictably
    (e.g. "Shift #1" then "Shift #34") whenever other workers clock in
    between their shifts — the sequence isn't scoped per worker, and it also
    never reclaims values from deleted rows or rolled-back inserts. This
    gives each worker a stable, gap-free personal shift number to display
    instead, computed at read time. It never touches the underlying primary
    key or any foreign key that references it (e.g. HandoverNote.shift_id),
    so relationships and existing references are unaffected.
    """
    if not worker_ids:
        return {}
    rows = (
        db.query(Shift.id, Shift.worker_id)
        .filter(Shift.worker_id.in_(worker_ids))
        .order_by(Shift.worker_id, Shift.start_time, Shift.id)
        .all()
    )
    numbers: dict[int, int] = {}
    counters: dict[int, int] = {}
    for shift_id, worker_id in rows:
        counters[worker_id] = counters.get(worker_id, 0) + 1
        numbers[shift_id] = counters[worker_id]
    return numbers