from sqlalchemy import Column, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import backref, relationship
from sqlalchemy.sql.expression import text
from sqlalchemy.sql.sqltypes import TIMESTAMP

from app.cores.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, nullable=False)
    email = Column(String, nullable=False, unique=True)
    username = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False, server_default="care_worker")
    previous_role = Column(String, nullable=True)
    name = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    job_title = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    profile_photo_url = Column(String, nullable=True)

    # --- Basic Information (Stage 3: Care Worker System) -------------------
    # Human-facing identifier distinct from the numeric primary key, same
    # pattern as Resident.resident_code. Auto-generated on create (see
    # routers/user.py) but stays editable for homes with their own scheme.
    employee_id = Column(String, nullable=True, unique=True, index=True)
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String, nullable=True)
    home_address = Column(Text, nullable=True)

    # --- Employment Information ---------------------------------------------
    # `job_title` and `department` (below) are shared with Stage 4 (Manager),
    # since both roles live on this one User table. `shift_pattern` is
    # care-worker specific but harmless to leave nullable for managers too.
    employment_type = Column(String, nullable=True)
    department = Column(String, nullable=True)
    shift_pattern = Column(String, nullable=True)
    # Distinct from `role` (which gates system access / login) -- this is
    # the HR-facing employment state (e.g. on leave, suspended) and doesn't
    # affect authentication.
    employment_status = Column(String, nullable=False, server_default="active")
    join_date = Column(Date, nullable=True)

    # --- Work Assignment (Stage 5: Assignment System) ------------------------
    # `manager_id` is the one column the assignment system needs directly on
    # User: Care Worker -> Manager is a simple many-to-one, so it's stored
    # here rather than in a join table. Self-referential FK (a manager is
    # also a row in `users`). ondelete="SET NULL" so deleting a manager
    # doesn't cascade-delete their care workers -- it just un-assigns them.
    #
    # Stage 6 review: kept as silent SET NULL on purpose. The app currently
    # supports a single care home with one default manager, so multi-manager
    # reassignment logic (block-on-delete, or auto-reassign-to-another-
    # manager) has no real "other manager" to fall back to yet. Revisit this
    # once multi-branch / multi-manager support lands and deleting a manager
    # becomes a routine, not exceptional, action.
    #
    # Resident <-> Care Worker is many-to-many and does NOT get a column
    # here -- see ResidentAssignment (app/models/assignment.py) and the
    # `assigned_residents` relationship below. "Assigned Care Worker(s)",
    # "Assigned Residents", "Assigned Manager", "Number of Residents
    # Overseen", and "Number of Care Workers Managed" are all derived from
    # these relationships (see schemas/user.py, schemas/resident.py) rather
    # than stored/cached, so they can never drift out of sync.
    manager_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # --- Management Information (Stage 4: Manager System) -------------------
    # Single free-text value for now -- the project currently supports one
    # care home. Kept as a plain column (not a FK to a CareHome table) so
    # that when multi-branch support lands it can be swapped for a real
    # relationship without disturbing every other field on this model.
    care_home = Column(String, nullable=True)

    # --- Emergency Contact ---------------------------------------------------
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_relationship = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)

    created_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )

    # --- Assignment relationships (Stage 5) ----------------------------------
    # Self-referential Care Worker -> Manager. `remote_side=[id]` marks which
    # side is the "one" (manager); `backref` gives every manager row a
    # `.managed_care_workers` collection of the care workers pointing at it.
    # NOTE on loading strategy: left at the default lazy="select" (load on
    # attribute access) rather than mapper-wide selectin. This pair of
    # relationships is bidirectional (User <-> Resident via
    # ResidentAssignment, plus the self-referential manager/
    # managed_care_workers backref below) -- if both sides were configured
    # selectin, loading one User would eager-load its Residents, which
    # would eager-load *their* Users, and so on indefinitely. Per-endpoint
    # eager loading (selectinload() query options) can be added where a
    # specific list endpoint needs it -- that's a Stage 6 performance pass,
    # not a Stage 5 correctness concern.
    manager = relationship(
        "User",
        remote_side=[id],
        foreign_keys=[manager_id],
        backref=backref("managed_care_workers"),
    )

    # Raw join-table rows for this user acting as the care worker side.
    # cascade="all, delete-orphan" so deleting a care worker cleans up their
    # assignment rows instead of leaving orphaned links behind.
    resident_links = relationship(
        "ResidentAssignment",
        back_populates="care_worker",
        foreign_keys="ResidentAssignment.care_worker_id",
        cascade="all, delete-orphan",
    )
    # Convenience read-only view straight to the Resident rows themselves
    # (writes go through ResidentAssignment / the assignments router, not
    # through this collection directly).
    assigned_residents = relationship(
        "Resident",
        secondary="resident_assignments",
        primaryjoin="User.id==ResidentAssignment.care_worker_id",
        secondaryjoin="Resident.id==ResidentAssignment.resident_id",
        viewonly=True,
    )

    # --- Manager-side rollup (Stage 7 remaining work) -------------------------
    # "Residents overseen" for a manager: the distinct set of residents
    # assigned to any of this manager's care workers. There's no direct
    # Manager<->Resident row anywhere -- it's derived by walking
    # managed_care_workers -> each worker's own assigned_residents and
    # de-duplicating (a resident can be on more than one care worker's
    # caseload). For a care worker (or a manager with no reports yet),
    # managed_care_workers is simply empty, so this naturally resolves to
    # an empty list rather than needing a role check here.
    @property
    def residents_overseen(self):
        seen = {}
        for worker in self.managed_care_workers:
            for resident in worker.assigned_residents:
                seen[resident.id] = resident
        return list(seen.values())