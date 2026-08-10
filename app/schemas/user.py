from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field

from app.schemas.assignment import AssignedResidentBrief, AssignedUserBrief

_PASSWORD_FIELD = Field(min_length=8, max_length=72)
_USERNAME_FIELD = Field(min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_.]+$")


def _calculate_age(dob: date | None) -> int | None:
    if dob is None:
        return None
    today = date.today()
    years = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        years -= 1
    return years


def _calculate_years_of_service(join_date: date | None) -> int | None:
    if join_date is None:
        return None
    today = date.today()
    years = today.year - join_date.year
    if (today.month, today.day) < (join_date.month, join_date.day):
        years -= 1
    return max(years, 0)


# ---------------------------------------------------------------------------
# Shared "Stage 3 / Stage 4" field set: Basic Information, Employment
# Information, Management Information, and Emergency Contact. Care Worker
# and Manager share this one User table, so this mixin backs both.
# "Work Assignment" fields (assigned residents / assigned manager) and the
# Stage 4 "Number of Care Workers Managed" / "Number of Residents
# Overseen" counts are intentionally NOT here -- per the Stage 5 assignment
# system they're derived from the assignment relationships, not stored. See
# the dedicated fields/computed_fields on UserOut below.
class _CareWorkerFields(BaseModel):
    employee_id: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    home_address: str | None = None

    employment_type: str | None = None
    department: str | None = None
    shift_pattern: str | None = None
    employment_status: str = "active"
    join_date: date | None = None

    # Management Information (Stage 4). Single free-text value until
    # multi-branch support exists -- see the comment on User.care_home.
    care_home: str | None = None

    emergency_contact_name: str | None = None
    emergency_contact_relationship: str | None = None
    emergency_contact_phone: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    username: str = _USERNAME_FIELD
    password: str = _PASSWORD_FIELD
    name: str | None = None


class UserUpdateSelf(BaseModel):
    name: str | None = None
    username: str | None = Field(default=None, min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_.]+$")
    phone_number: str | None = None
    job_title: str | None = None
    bio: str | None = Field(default=None, max_length=1000)
    profile_photo_url: str | None = None


class UserOut(_CareWorkerFields):
    email: str
    username: str
    id: int
    created_at: datetime
    role: str
    name: str | None = None
    phone_number: str | None = None
    job_title: str | None = None
    bio: str | None = None
    profile_photo_url: str | None = None

    # --- Stage 5: Assignment System -----------------------------------------
    # All derived from the assignment relationships on the User model
    # (never stored), so they can't drift out of sync. `manager` /
    # `assigned_residents` are populated for care workers; `managed_care_
    # workers` is populated for managers. The unused side is simply an
    # empty list / null, which also makes the *_count fields naturally 0.
    manager: AssignedUserBrief | None = None
    assigned_residents: list[AssignedResidentBrief] = Field(default_factory=list)
    managed_care_workers: list[AssignedUserBrief] = Field(default_factory=list)
    # Derived rollup for managers -- distinct residents assigned to any of
    # this manager's care workers (see User.residents_overseen). Empty for
    # care workers / managers with no reports, same pattern as the fields
    # above.
    residents_overseen: list[AssignedResidentBrief] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[misc]
    @property
    def age(self) -> int | None:
        """Derived from date_of_birth rather than stored, so it never goes
        stale and can't be edited out of sync with the DOB."""
        return _calculate_age(self.date_of_birth)

    @computed_field  # type: ignore[misc]
    @property
    def years_of_service(self) -> int | None:
        """Derived from join_date so it's always accurate as time passes."""
        return _calculate_years_of_service(self.join_date)

    @computed_field  # type: ignore[misc]
    @property
    def residents_overseen_count(self) -> int:
        """Stage 4/5: "Number of Residents Overseen". For a care worker this
        is how many residents are currently assigned to them directly
        (`assigned_residents`); for a manager it's the distinct residents
        assigned across all of their care workers' caseloads
        (`residents_overseen`). Only one of the two lists is ever populated
        for a given role, so summing both is safe and avoids hardcoding a
        role check here.

        Bug fix: this previously always read `len(self.assigned_residents)`,
        which is empty for managers, so a manager's "residents overseen"
        count silently showed 0 on TeamPage even though the
        `residents_overseen` list itself was populated correctly.
        """
        return len(self.assigned_residents) + len(self.residents_overseen)

    @computed_field  # type: ignore[misc]
    @property
    def care_workers_managed_count(self) -> int:
        """Stage 4/5: "Number of Care Workers Managed" -- for a manager,
        how many care workers currently report to them."""
        return len(self.managed_care_workers)


class UserCreateByManager(_CareWorkerFields):
    """Only account essentials are required -- the rest of the Care Worker
    profile (employment info, emergency contact, etc.) can be filled in any
    time from the profile page, same pattern as ResidentCreate."""

    email: EmailStr
    username: str = _USERNAME_FIELD
    password: str = _PASSWORD_FIELD
    role: str = Field(default="care_worker", pattern="^(care_worker|manager)$")
    name: str | None = None
    phone_number: str | None = None
    job_title: str | None = None


class UserUpdateByManager(_CareWorkerFields):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_.]+$")
    role: str | None = Field(default=None, pattern="^(care_worker|manager)$")
    password: str | None = None
    name: str | None = None
    phone_number: str | None = None
    job_title: str | None = None
    bio: str | None = Field(default=None, max_length=1000)
    profile_photo_url: str | None = None


class UserLogin(BaseModel):
    username: str
    password: str


class VerifyOTP(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ForgotPassword(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = _PASSWORD_FIELD


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = _PASSWORD_FIELD


class ResendOTP(BaseModel):
    email: EmailStr