from sqlalchemy import ARRAY, Column, Date, Integer, String, Text, TIMESTAMP
from sqlalchemy.orm import relationship

from app.cores.database import Base


class Resident(Base):
    __tablename__ = "residents"

    # --- Identity / existing columns (unchanged) ---------------------------
    id = Column(Integer, primary_key=True, nullable=False)
    name = Column(String, nullable=False)
    status = Column(String, nullable=False, server_default="active")
    discharged_at = Column(TIMESTAMP(timezone=True), nullable=True)

    # --- Basic Information ---------------------------------------------------
    preferred_name = Column(String, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String, nullable=True)
    # Human-facing identifier shown on badges/paperwork, distinct from the
    # numeric primary key. Auto-generated (see routers/residents.py) so it's
    # never left blank, but kept editable in case a home has its own scheme.
    resident_code = Column(String, nullable=True, unique=True, index=True)
    admission_date = Column(Date, nullable=True)
    room_number = Column(String, nullable=True)
    ward_unit = Column(String, nullable=True)

    # --- Medical Information ---------------------------------------------------
    # String-list fields use Postgres arrays rather than a free-text blob so
    # the frontend can render them as chips and, later, filter/search on them.
    medical_conditions = Column(ARRAY(String), nullable=False, server_default="{}")
    allergies = Column(ARRAY(String), nullable=False, server_default="{}")
    current_medications = Column(ARRAY(String), nullable=False, server_default="{}")
    disability = Column(Text, nullable=True)
    mobility_status = Column(String, nullable=True)
    dietary_requirements = Column(Text, nullable=True)
    communication_requirements = Column(Text, nullable=True)
    sensory_loss = Column(Text, nullable=True)

    # --- Care Information ---------------------------------------------------
    # "Assigned Care Worker(s)" is intentionally NOT a column here. Per the
    # Stage 5 assignment system, it's derived from the resident_assignments
    # join table (see `assigned_care_workers` below and
    # app/models/assignment.py) rather than stored redundantly on the
    # resident row -- storing it here would let it drift out of sync with
    # the source of truth.
    care_level = Column(String, nullable=True)
    risk_level = Column(String, nullable=True)
    behaviour_notes = Column(Text, nullable=True)
    daily_care_notes = Column(Text, nullable=True)

    # --- Emergency Contact ---------------------------------------------------
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_relationship = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)

    # --- Personal Information ---------------------------------------------------
    religion = Column(String, nullable=True)
    ethnicity = Column(String, nullable=True)
    preferred_language = Column(String, nullable=True)

    # --- Assignment relationships (Stage 5) ----------------------------------
    # Raw join-table rows for this resident. cascade="all, delete-orphan" so
    # deleting a resident cleans up their assignment rows instead of leaving
    # orphaned links behind.
    care_worker_links = relationship(
        "ResidentAssignment",
        back_populates="resident",
        foreign_keys="ResidentAssignment.resident_id",
        cascade="all, delete-orphan",
    )
    # Convenience read-only view straight to the assigned User rows (writes
    # go through ResidentAssignment / the assignments router, not through
    # this collection directly). Left at default lazy="select" -- see the
    # loading-strategy note on User.assigned_residents in
    # app/models/user.py.
    assigned_care_workers = relationship(
        "User",
        secondary="resident_assignments",
        primaryjoin="Resident.id==ResidentAssignment.resident_id",
        secondaryjoin="User.id==ResidentAssignment.care_worker_id",
        viewonly=True,
    )