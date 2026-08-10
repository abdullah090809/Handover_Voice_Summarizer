from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# "Brief" views used when a User or Resident is nested inside another
# object's response (e.g. the list of care workers assigned to a resident).
# Deliberately small -- just enough to identify and display the linked
# record -- rather than the full ResidentOut/UserOut, to keep nested
# payloads light and avoid re-exposing every field (medical info, employment
# info, etc.) in a context where it isn't needed.
# ---------------------------------------------------------------------------


class AssignedUserBrief(BaseModel):
    id: int
    name: str | None = None
    username: str
    role: str
    employee_id: str | None = None
    job_title: str | None = None
    profile_photo_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AssignedResidentBrief(BaseModel):
    id: int
    name: str
    resident_code: str | None = None
    status: str
    room_number: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ResidentAssignmentOut(BaseModel):
    """A single resident<->care worker link, with metadata. Used by the
    dedicated assignment list endpoints (as opposed to the brief user/
    resident lists nested on ResidentOut/UserOut)."""

    id: int
    resident: AssignedResidentBrief
    care_worker: AssignedUserBrief
    assigned_by: AssignedUserBrief | None = None
    assigned_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Request payloads
# ---------------------------------------------------------------------------


class ResidentCareWorkerAssignmentUpdate(BaseModel):
    """Body for PUT /assignments/residents/{resident_id}/care-workers.
    Replaces the resident's *entire* set of assigned care workers with this
    list in one call (i.e. "reassign")."""

    care_worker_ids: list[int] = Field(default_factory=list)


class CareWorkerResidentAssignmentUpdate(BaseModel):
    """Body for PUT /assignments/care-workers/{care_worker_id}/residents.
    Replaces the care worker's *entire* caseload with this list in one call
    -- the mirror image of ResidentCareWorkerAssignmentUpdate, for the
    "assign several residents to one worker" workflow."""

    resident_ids: list[int] = Field(default_factory=list)


class ManagerAssignmentUpdate(BaseModel):
    """Body for PATCH /assignments/care-workers/{care_worker_id}/manager.
    Set manager_id to assign/reassign; set it to null to remove the care
    worker's manager assignment."""

    manager_id: int | None = None