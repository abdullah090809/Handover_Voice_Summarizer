from sqlalchemy import Column, ForeignKey, Integer, String

from app.cores.database import Base


class Resident(Base):
    __tablename__ = "residents"

    id = Column(Integer, primary_key=True, nullable=False)
    name = Column(String, nullable=False)
    # Issue #9 fix: RESTRICT instead of CASCADE — deleting a care home should
    # be an explicit, auditable decision about what happens to its residents,
    # not a silent mass-delete side effect.
    # Issue #10 fix: index the FK for the tenant-scoped queries added in
    # residents.py / handover.py.
    care_home_id = Column(
        Integer,
        ForeignKey("care_homes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
