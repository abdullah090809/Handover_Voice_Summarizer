from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, computed_field

from app.schemas.assignment import AssignedUserBrief


def _calculate_age(dob: date | None) -> int | None:
    if dob is None:
        return None
    today = date.today()
    years = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        years -= 1
    return years


# ---------------------------------------------------------------------------
# Shared field set. ResidentCreate/ResidentUpdate both build on this so the
# two payload shapes can't silently drift apart as fields are added.
# ---------------------------------------------------------------------------
class _ResidentFields(BaseModel):
    # Basic Information
    name: str
    preferred_name: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    resident_code: str | None = None
    admission_date: date | None = None
    room_number: str | None = None
    ward_unit: str | None = None
    # Free-text, matching users.care_home -- used to derive a manager's
    # "residents overseen" (see User.residents_overseen / migration
    # 41c101ed6a74). Not shown as a distinct form field to care workers;
    # a manager sets it once per resident, typically matching their own.
    care_home: str | None = None

    # Medical Information
    medical_conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    disability: str | None = None
    mobility_status: str | None = None
    dietary_requirements: str | None = None
    communication_requirements: str | None = None
    sensory_loss: str | None = None

    # Care Information (assigned_care_worker/risk owner etc. are derived --
    # see Stage 5 assignment system, not stored here)
    care_level: str | None = None
    risk_level: str | None = None
    behaviour_notes: str | None = None
    daily_care_notes: str | None = None

    # Emergency Contact
    emergency_contact_name: str | None = None
    emergency_contact_relationship: str | None = None
    emergency_contact_phone: str | None = None

    # Personal Information
    religion: str | None = None
    ethnicity: str | None = None
    preferred_language: str | None = None


class ResidentCreate(_ResidentFields):
    """Full payload for creating a resident. Only `name` is required --
    everything else can be filled in later from the profile page."""


class ResidentUpdate(_ResidentFields):
    """Full payload for PUT /residents/{id}. Kept as a separate class (rather
    than reusing ResidentCreate) so create- and update-only fields can diverge
    later without a breaking change."""


class ResidentOut(_ResidentFields):
    id: int
    status: str
    discharged_at: datetime | None = None

    # --- Stage 5: Assignment System -----------------------------------------
    # Derived from the resident_assignments join table (via the
    # `assigned_care_workers` relationship on the Resident model) rather
    # than stored, so it can never drift out of sync with the source of
    # truth. Populated automatically by from_attributes -- no endpoint
    # needs to set this manually.
    assigned_care_workers: list[AssignedUserBrief] = Field(default_factory=list)

    class Config:
        from_attributes = True

    @computed_field  # type: ignore[misc]
    @property
    def age(self) -> int | None:
        """Derived from date_of_birth rather than stored, so it never goes
        stale and can't be edited out of sync with the DOB."""
        return _calculate_age(self.date_of_birth)

    @computed_field  # type: ignore[misc]
    @property
    def assigned_care_worker_count(self) -> int:
        """Number of care workers currently assigned to this resident."""
        return len(self.assigned_care_workers)


class ResidentStatusUpdate(BaseModel):
    status: Literal["active", "discharged", "deceased"]