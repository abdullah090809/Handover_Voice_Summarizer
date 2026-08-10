from sqlalchemy import Column, ForeignKey, Integer, TIMESTAMP, UniqueConstraint
from sqlalchemy.sql.expression import text
from sqlalchemy.orm import relationship

from app.cores.database import Base


class ResidentAssignment(Base):
    """Join table linking Residents to the Care Workers assigned to them.

    Many-to-many: a resident can have multiple care workers, and a care
    worker can be assigned to multiple residents. Modeled as an explicit
    association object (rather than a bare secondary table) so we can keep
    metadata about *when* and *by whom* the assignment was made.

    The Care Worker -> Manager relationship is NOT stored here -- that's a
    simple many-to-one and lives directly on User.manager_id (see
    app/models/user.py). Only the Resident <-> Care Worker many-to-many
    needs its own table.
    """

    __tablename__ = "resident_assignments"

    id = Column(Integer, primary_key=True, nullable=False)
    resident_id = Column(
        Integer,
        ForeignKey("residents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    care_worker_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Who made the assignment (manager). Kept nullable + SET NULL so that
    # deleting the assigning manager's account later doesn't cascade-delete
    # the assignment itself -- the assignment is still valid, we just lose
    # the "assigned by" attribution.
    assigned_by_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint(
            "resident_id", "care_worker_id", name="uq_resident_care_worker"
        ),
    )

    resident = relationship(
        "Resident",
        back_populates="care_worker_links",
        foreign_keys=[resident_id],
    )
    care_worker = relationship(
        "User",
        back_populates="resident_links",
        foreign_keys=[care_worker_id],
    )
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])