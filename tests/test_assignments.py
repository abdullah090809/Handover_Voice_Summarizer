from app.models.assignment import ResidentAssignment
from app.models.notification import Notification
from app.models.resident import Resident
from app.models.user import User

from tests.conftest import auth_headers_for, make_worker


# ---------------------------------------------------------------------------
# POST /assignments/residents/{resident_id}/care-workers/{care_worker_id}
# ---------------------------------------------------------------------------

def test_assign_care_worker_to_resident_as_manager_success(
    client, manager_auth_headers, test_resident, test_user, db_session
):
    response = client.post(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_user.id}",
        headers=manager_auth_headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == test_resident.id

    link = (
        db_session.query(ResidentAssignment)
        .filter(
            ResidentAssignment.resident_id == test_resident.id,
            ResidentAssignment.care_worker_id == test_user.id,
        )
        .first()
    )
    assert link is not None


def test_assign_care_worker_to_resident_as_worker_forbidden(
    client, worker_auth_headers, test_resident, test_user
):
    response = client.post(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_user.id}",
        headers=worker_auth_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Manager role required"


def test_assign_care_worker_requires_auth(client, test_resident, test_user):
    response = client.post(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_user.id}"
    )
    assert response.status_code == 401


def test_assign_care_worker_nonexistent_resident_returns_404(
    client, manager_auth_headers, test_user
):
    response = client.post(
        f"/assignments/residents/99999/care-workers/{test_user.id}",
        headers=manager_auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Resident with id 99999 not found"


def test_assign_nonexistent_care_worker_returns_404(
    client, manager_auth_headers, test_resident
):
    response = client.post(
        f"/assignments/residents/{test_resident.id}/care-workers/99999",
        headers=manager_auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "User with id 99999 not found"


def test_assign_manager_as_care_worker_rejected(
    client, manager_auth_headers, test_resident, test_manager
):
    """Only care_worker-role users can be assigned to a resident."""
    response = client.post(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_manager.id}",
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert "not 'care_worker'" in response.json()["detail"]


def test_assign_care_worker_duplicate_rejected(
    client, manager_auth_headers, test_resident, test_user, db_session
):
    db_session.add(
        ResidentAssignment(resident_id=test_resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()

    response = client.post(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_user.id}",
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert "already assigned" in response.json()["detail"]


def test_assign_care_worker_who_has_left_rejected(
    client, manager_auth_headers, test_resident, test_user, db_session
):
    test_user.employment_status = "left"
    db_session.commit()

    response = client.post(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_user.id}",
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert "has left" in response.json()["detail"]


def test_assign_care_worker_creates_notification(
    client, manager_auth_headers, test_resident, test_user, db_session
):
    response = client.post(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_user.id}",
        headers=manager_auth_headers,
    )
    assert response.status_code == 201

    notification = (
        db_session.query(Notification)
        .filter(Notification.resident_id == test_resident.id)
        .first()
    )
    assert notification is not None
    assert test_resident.name in notification.message


# ---------------------------------------------------------------------------
# DELETE /assignments/residents/{resident_id}/care-workers/{care_worker_id}
# ---------------------------------------------------------------------------

def test_remove_care_worker_from_resident_as_manager_success(
    client, manager_auth_headers, test_resident, test_user, db_session
):
    db_session.add(
        ResidentAssignment(resident_id=test_resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()

    response = client.delete(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_user.id}",
        headers=manager_auth_headers,
    )
    assert response.status_code == 200

    link = (
        db_session.query(ResidentAssignment)
        .filter(
            ResidentAssignment.resident_id == test_resident.id,
            ResidentAssignment.care_worker_id == test_user.id,
        )
        .first()
    )
    assert link is None


def test_remove_care_worker_from_resident_as_worker_forbidden(
    client, worker_auth_headers, test_resident, test_user, db_session
):
    db_session.add(
        ResidentAssignment(resident_id=test_resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()

    response = client.delete(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_user.id}",
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


def test_remove_nonexistent_assignment_returns_404(
    client, manager_auth_headers, test_resident, test_user
):
    response = client.delete(
        f"/assignments/residents/{test_resident.id}/care-workers/{test_user.id}",
        headers=manager_auth_headers,
    )
    assert response.status_code == 404
    assert "not assigned to resident" in response.json()["detail"]


def test_remove_care_worker_from_nonexistent_resident_returns_404(
    client, manager_auth_headers, test_user
):
    response = client.delete(
        f"/assignments/residents/99999/care-workers/{test_user.id}",
        headers=manager_auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Resident with id 99999 not found"


# ---------------------------------------------------------------------------
# PUT /assignments/residents/{resident_id}/care-workers  (replace set)
# ---------------------------------------------------------------------------

def test_set_resident_care_workers_replaces_entire_set(
    client, manager_auth_headers, test_resident, db_session
):
    worker_a = make_worker(db_session, email="a@test.com")
    worker_b = make_worker(db_session, email="b@test.com")
    worker_c = make_worker(db_session, email="c@test.com")

    # Start with a + b assigned.
    db_session.add_all(
        [
            ResidentAssignment(resident_id=test_resident.id, care_worker_id=worker_a.id),
            ResidentAssignment(resident_id=test_resident.id, care_worker_id=worker_b.id),
        ]
    )
    db_session.commit()

    # Replace with b + c (a removed, c added, b unchanged).
    response = client.put(
        f"/assignments/residents/{test_resident.id}/care-workers",
        json={"care_worker_ids": [worker_b.id, worker_c.id]},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200

    remaining_ids = {
        link.care_worker_id
        for link in db_session.query(ResidentAssignment)
        .filter(ResidentAssignment.resident_id == test_resident.id)
        .all()
    }
    assert remaining_ids == {worker_b.id, worker_c.id}


def test_set_resident_care_workers_empty_list_clears_all(
    client, manager_auth_headers, test_resident, test_user, db_session
):
    db_session.add(
        ResidentAssignment(resident_id=test_resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()

    response = client.put(
        f"/assignments/residents/{test_resident.id}/care-workers",
        json={"care_worker_ids": []},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200

    remaining = (
        db_session.query(ResidentAssignment)
        .filter(ResidentAssignment.resident_id == test_resident.id)
        .count()
    )
    assert remaining == 0


def test_set_resident_care_workers_as_worker_forbidden(
    client, worker_auth_headers, test_resident
):
    response = client.put(
        f"/assignments/residents/{test_resident.id}/care-workers",
        json={"care_worker_ids": []},
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


def test_set_resident_care_workers_invalid_id_rejects_whole_request(
    client, manager_auth_headers, test_resident, test_user, db_session
):
    """A bad id anywhere in the payload should fail the whole request,
    leaving no partial assignment applied."""
    response = client.put(
        f"/assignments/residents/{test_resident.id}/care-workers",
        json={"care_worker_ids": [test_user.id, 99999]},
        headers=manager_auth_headers,
    )
    assert response.status_code == 404

    remaining = (
        db_session.query(ResidentAssignment)
        .filter(ResidentAssignment.resident_id == test_resident.id)
        .count()
    )
    assert remaining == 0


def test_set_resident_care_workers_left_worker_new_assignment_rejected(
    client, manager_auth_headers, test_resident, test_user, db_session
):
    test_user.employment_status = "left"
    db_session.commit()

    response = client.put(
        f"/assignments/residents/{test_resident.id}/care-workers",
        json={"care_worker_ids": [test_user.id]},
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert "has left" in response.json()["detail"]


def test_set_resident_care_workers_left_worker_already_assigned_unchanged_allowed(
    client, manager_auth_headers, test_resident, test_user, db_session
):
    """A worker who has since left, but was already on the resident's list
    and is left unchanged in the payload, is not rejected -- only a *new*
    assignment to a left worker is blocked."""
    db_session.add(
        ResidentAssignment(resident_id=test_resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()
    test_user.employment_status = "left"
    db_session.commit()

    response = client.put(
        f"/assignments/residents/{test_resident.id}/care-workers",
        json={"care_worker_ids": [test_user.id]},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# GET /assignments/residents/{resident_id}/care-workers
# ---------------------------------------------------------------------------

def test_list_resident_care_workers_open_to_any_authenticated_user(
    client, worker_auth_headers, test_resident, test_user, db_session
):
    db_session.add(
        ResidentAssignment(resident_id=test_resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()

    response = client.get(
        f"/assignments/residents/{test_resident.id}/care-workers",
        headers=worker_auth_headers,
    )
    assert response.status_code == 200
    ids = [w["id"] for w in response.json()]
    assert test_user.id in ids


def test_list_resident_care_workers_nonexistent_resident_returns_404(
    client, worker_auth_headers
):
    response = client.get(
        "/assignments/residents/99999/care-workers", headers=worker_auth_headers
    )
    assert response.status_code == 404


def test_list_resident_care_workers_requires_auth(client, test_resident):
    response = client.get(f"/assignments/residents/{test_resident.id}/care-workers")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# PUT /assignments/care-workers/{care_worker_id}/residents  (replace caseload)
# ---------------------------------------------------------------------------

def test_set_care_worker_residents_replaces_caseload(
    client, manager_auth_headers, test_user, db_session
):
    resident_a = Resident(name="Resident A")
    resident_b = Resident(name="Resident B")
    db_session.add_all([resident_a, resident_b])
    db_session.commit()
    db_session.refresh(resident_a)
    db_session.refresh(resident_b)

    response = client.put(
        f"/assignments/care-workers/{test_user.id}/residents",
        json={"resident_ids": [resident_a.id, resident_b.id]},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200

    caseload_ids = {
        link.resident_id
        for link in db_session.query(ResidentAssignment)
        .filter(ResidentAssignment.care_worker_id == test_user.id)
        .all()
    }
    assert caseload_ids == {resident_a.id, resident_b.id}


def test_set_care_worker_residents_growing_caseload_for_left_worker_rejected(
    client, manager_auth_headers, test_user, test_resident, db_session
):
    test_user.employment_status = "left"
    db_session.commit()

    response = client.put(
        f"/assignments/care-workers/{test_user.id}/residents",
        json={"resident_ids": [test_resident.id]},
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert "has left" in response.json()["detail"]


def test_set_care_worker_residents_shrinking_caseload_for_left_worker_allowed(
    client, manager_auth_headers, test_user, test_resident, db_session
):
    """Clearing/shrinking an existing caseload for someone who has since
    left is still allowed -- only growth is blocked."""
    db_session.add(
        ResidentAssignment(resident_id=test_resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()
    test_user.employment_status = "left"
    db_session.commit()

    response = client.put(
        f"/assignments/care-workers/{test_user.id}/residents",
        json={"resident_ids": []},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200

    remaining = (
        db_session.query(ResidentAssignment)
        .filter(ResidentAssignment.care_worker_id == test_user.id)
        .count()
    )
    assert remaining == 0


def test_set_care_worker_residents_as_worker_forbidden(
    client, worker_auth_headers, test_user
):
    response = client.put(
        f"/assignments/care-workers/{test_user.id}/residents",
        json={"resident_ids": []},
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


def test_set_care_worker_residents_nonexistent_worker_returns_404(
    client, manager_auth_headers
):
    response = client.put(
        "/assignments/care-workers/99999/residents",
        json={"resident_ids": []},
        headers=manager_auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "User with id 99999 not found"


def test_set_care_worker_residents_manager_id_rejected(
    client, manager_auth_headers, test_manager
):
    """The care_worker_id path param must actually resolve to a
    care_worker-role user."""
    response = client.put(
        f"/assignments/care-workers/{test_manager.id}/residents",
        json={"resident_ids": []},
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert "not 'care_worker'" in response.json()["detail"]


# ---------------------------------------------------------------------------
# GET /assignments/care-workers/{care_worker_id}/residents
# ---------------------------------------------------------------------------

def test_list_care_worker_residents_as_manager_success(
    client, manager_auth_headers, test_user, test_resident, db_session
):
    db_session.add(
        ResidentAssignment(resident_id=test_resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()

    response = client.get(
        f"/assignments/care-workers/{test_user.id}/residents",
        headers=manager_auth_headers,
    )
    assert response.status_code == 200
    ids = [r["id"] for r in response.json()]
    assert test_resident.id in ids


def test_list_care_worker_residents_self_view_allowed(
    client, worker_auth_headers, test_user, test_resident, db_session
):
    db_session.add(
        ResidentAssignment(resident_id=test_resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()

    response = client.get(
        f"/assignments/care-workers/{test_user.id}/residents",
        headers=worker_auth_headers,
    )
    assert response.status_code == 200


def test_list_care_worker_residents_other_worker_forbidden(
    client, worker_auth_headers, db_session
):
    other = make_worker(db_session)

    response = client.get(
        f"/assignments/care-workers/{other.id}/residents",
        headers=worker_auth_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "You may only view your own assignments"


def test_list_care_worker_residents_nonexistent_worker_returns_404(
    client, manager_auth_headers
):
    response = client.get(
        "/assignments/care-workers/99999/residents", headers=manager_auth_headers
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /assignments/care-workers/{care_worker_id}/manager
# ---------------------------------------------------------------------------

def test_assign_manager_to_care_worker_success(
    client, manager_auth_headers, test_user, test_manager, db_session
):
    response = client.patch(
        f"/assignments/care-workers/{test_user.id}/manager",
        json={"manager_id": test_manager.id},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["id"] == test_user.id

    db_session.refresh(test_user)
    assert test_user.manager_id == test_manager.id


def test_remove_care_worker_manager_with_null(
    client, manager_auth_headers, test_user, test_manager, db_session
):
    test_user.manager_id = test_manager.id
    db_session.commit()

    response = client.patch(
        f"/assignments/care-workers/{test_user.id}/manager",
        json={"manager_id": None},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200

    db_session.refresh(test_user)
    assert test_user.manager_id is None


def test_assign_manager_to_care_worker_as_worker_forbidden(
    client, worker_auth_headers, test_user, test_manager
):
    response = client.patch(
        f"/assignments/care-workers/{test_user.id}/manager",
        json={"manager_id": test_manager.id},
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


def test_assign_nonexistent_manager_returns_404(
    client, manager_auth_headers, test_user
):
    response = client.patch(
        f"/assignments/care-workers/{test_user.id}/manager",
        json={"manager_id": 99999},
        headers=manager_auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "User with id 99999 not found"


def test_assign_care_worker_as_manager_id_rejected(
    client, manager_auth_headers, test_user, db_session
):
    """The manager_id payload must resolve to an actual manager-role user,
    not another care worker."""
    other_worker = make_worker(db_session)

    response = client.patch(
        f"/assignments/care-workers/{test_user.id}/manager",
        json={"manager_id": other_worker.id},
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert "not 'manager'" in response.json()["detail"]


def test_assign_manager_to_nonexistent_care_worker_returns_404(
    client, manager_auth_headers, test_manager
):
    response = client.patch(
        "/assignments/care-workers/99999/manager",
        json={"manager_id": test_manager.id},
        headers=manager_auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "User with id 99999 not found"


# ---------------------------------------------------------------------------
# GET /assignments/managers/{manager_id}/care-workers
# ---------------------------------------------------------------------------

def test_list_manager_care_workers_as_manager_success(
    client, manager_auth_headers, test_manager, test_user, db_session
):
    test_user.manager_id = test_manager.id
    db_session.commit()

    response = client.get(
        f"/assignments/managers/{test_manager.id}/care-workers",
        headers=manager_auth_headers,
    )
    assert response.status_code == 200
    ids = [w["id"] for w in response.json()]
    assert test_user.id in ids


def test_list_manager_care_workers_self_view_allowed(
    client, test_manager, test_user, db_session
):
    test_user.manager_id = test_manager.id
    db_session.commit()

    response = client.get(
        f"/assignments/managers/{test_manager.id}/care-workers",
        headers=auth_headers_for(test_manager),
    )
    assert response.status_code == 200


def test_list_manager_care_workers_as_worker_forbidden(
    client, worker_auth_headers, test_manager
):
    """A care worker isn't a manager and isn't viewing "their own" record
    (manager_id path is a different user), so they're forbidden even
    though _require_self_or_manager allows self-view for managers."""
    response = client.get(
        f"/assignments/managers/{test_manager.id}/care-workers",
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


def test_list_manager_care_workers_other_manager_allowed(
    client, manager_auth_headers, db_session
):
    """Managers can view any manager's team, not just their own."""
    other_manager = User(
        email="othermanager@test.com",
        username="othermanager",
        password="x",
        role="manager",
    )
    db_session.add(other_manager)
    db_session.commit()
    db_session.refresh(other_manager)

    response = client.get(
        f"/assignments/managers/{other_manager.id}/care-workers",
        headers=manager_auth_headers,
    )
    assert response.status_code == 200


def test_list_manager_care_workers_nonexistent_manager_returns_404(
    client, manager_auth_headers
):
    response = client.get(
        "/assignments/managers/99999/care-workers", headers=manager_auth_headers
    )
    assert response.status_code == 404


def test_list_manager_care_workers_worker_id_rejected(
    client, manager_auth_headers, test_user
):
    """manager_id path param must resolve to a manager-role user."""
    response = client.get(
        f"/assignments/managers/{test_user.id}/care-workers",
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert "not 'manager'" in response.json()["detail"]