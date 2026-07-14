from datetime import datetime, timezone

from app.models.shift import Shift

from .conftest import auth_headers_for, make_worker


# ---------------------------------------------------------------------------
# POST /shifts/
# ---------------------------------------------------------------------------

def test_create_shift_success(client, worker_auth_headers):
    response = client.post(
        "/shifts/",
        json={"start_time": datetime.now(timezone.utc).isoformat()},
        headers=worker_auth_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert "id" in body
    assert body["end_time"] is None


def test_create_shift_with_end_time(client, worker_auth_headers):
    start = datetime.now(timezone.utc)
    end = start.replace(hour=(start.hour + 1) % 24)
    response = client.post(
        "/shifts/",
        json={"start_time": start.isoformat(), "end_time": end.isoformat()},
        headers=worker_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["end_time"] is not None


def test_create_shift_requires_auth(client):
    response = client.post(
        "/shifts/", json={"start_time": datetime.now(timezone.utc).isoformat()}
    )
    assert response.status_code == 401


def test_create_shift_missing_start_time_rejected(client, worker_auth_headers):
    response = client.post("/shifts/", json={}, headers=worker_auth_headers)
    assert response.status_code == 422


def test_create_shift_invalid_datetime_format_rejected(client, worker_auth_headers):
    response = client.post(
        "/shifts/", json={"start_time": "not-a-date"}, headers=worker_auth_headers
    )
    assert response.status_code == 422


def test_create_shift_assigns_current_user_as_worker(client, worker_auth_headers, test_user):
    response = client.post(
        "/shifts/",
        json={"start_time": datetime.now(timezone.utc).isoformat()},
        headers=worker_auth_headers,
    )
    assert response.json()["worker_id"] == test_user.id


def test_manager_can_also_create_own_shift(client, manager_auth_headers, test_manager):
    response = client.post(
        "/shifts/",
        json={"start_time": datetime.now(timezone.utc).isoformat()},
        headers=manager_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["worker_id"] == test_manager.id


# ---------------------------------------------------------------------------
# GET /shifts/
# ---------------------------------------------------------------------------

def test_list_my_shifts_only_returns_own_shifts(
    client, worker_auth_headers, test_shift, test_manager, db_session
):
    other_shift = Shift(worker_id=test_manager.id, start_time=datetime.now(timezone.utc))
    db_session.add(other_shift)
    db_session.commit()

    response = client.get("/shifts/", headers=worker_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert all(s["worker_id"] == test_shift.worker_id for s in body)
    assert any(s["id"] == test_shift.id for s in body)


def test_list_shifts_requires_auth(client):
    response = client.get("/shifts/")
    assert response.status_code == 401


def test_list_shifts_with_worker_id_as_manager_success(
    client, manager_auth_headers, test_shift, test_user
):
    response = client.get(f"/shifts/?worker_id={test_user.id}", headers=manager_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert all(s["worker_id"] == test_user.id for s in body)
    assert any(s["id"] == test_shift.id for s in body)


def test_list_shifts_with_worker_id_as_non_manager_forbidden(
    client, worker_auth_headers, test_manager
):
    response = client.get(f"/shifts/?worker_id={test_manager.id}", headers=worker_auth_headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "Only managers can view other workers' shifts"


def test_list_shifts_with_nonexistent_worker_id_404(client, manager_auth_headers):
    response = client.get("/shifts/?worker_id=99999", headers=manager_auth_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Worker with id 99999 not found"


def test_list_shifts_pagination(client, worker_auth_headers, db_session, test_user):
    for _ in range(5):
        db_session.add(Shift(worker_id=test_user.id, start_time=datetime.now(timezone.utc)))
    db_session.commit()

    response = client.get("/shifts/?skip=0&limit=2", headers=worker_auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_shifts_limit_over_max_rejected(client, worker_auth_headers):
    response = client.get("/shifts/?limit=500", headers=worker_auth_headers)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /shifts/{id}
# ---------------------------------------------------------------------------

def test_get_own_shift_success(client, worker_auth_headers, test_shift):
    response = client.get(f"/shifts/{test_shift.id}", headers=worker_auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == test_shift.id


def test_get_any_shift_as_manager_allowed(client, manager_auth_headers, test_shift):
    response = client.get(f"/shifts/{test_shift.id}", headers=manager_auth_headers)

    assert response.status_code == 200


def test_get_other_workers_shift_as_non_manager_forbidden(client, db_session, test_shift):
    other_worker = make_worker(db_session)
    headers = auth_headers_for(other_worker)

    response = client.get(f"/shifts/{test_shift.id}", headers=headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized to view this shift"


def test_get_nonexistent_shift_returns_404(client, worker_auth_headers):
    response = client.get("/shifts/99999", headers=worker_auth_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Shift with id 99999 not found"


def test_get_shift_requires_auth(client, test_shift):
    response = client.get(f"/shifts/{test_shift.id}")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# PUT /shifts/{id}
# ---------------------------------------------------------------------------

def test_update_own_shift_success(client, worker_auth_headers, test_shift):
    new_start = datetime.now(timezone.utc).isoformat()
    response = client.put(
        f"/shifts/{test_shift.id}",
        json={"start_time": new_start},
        headers=worker_auth_headers,
    )

    assert response.status_code == 200


def test_update_other_workers_shift_forbidden(client, db_session, test_shift):
    other_worker = make_worker(db_session, "otherworker2@test.com")
    headers = auth_headers_for(other_worker)

    response = client.put(
        f"/shifts/{test_shift.id}",
        json={"start_time": datetime.now(timezone.utc).isoformat()},
        headers=headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized to update this shift"


def test_manager_cannot_update_other_workers_shift(client, manager_auth_headers, test_shift):
    """Unlike GET, update is restricted strictly to the owning worker —
    managers get no special-case bypass here."""
    response = client.put(
        f"/shifts/{test_shift.id}",
        json={"start_time": datetime.now(timezone.utc).isoformat()},
        headers=manager_auth_headers,
    )
    assert response.status_code == 403


def test_update_nonexistent_shift_returns_404(client, worker_auth_headers):
    response = client.put(
        "/shifts/99999",
        json={"start_time": datetime.now(timezone.utc).isoformat()},
        headers=worker_auth_headers,
    )
    assert response.status_code == 404


def test_update_shift_requires_auth(client, test_shift):
    response = client.put(
        f"/shifts/{test_shift.id}", json={"start_time": datetime.now(timezone.utc).isoformat()}
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /shifts/{id}
# ---------------------------------------------------------------------------

def test_delete_own_shift_success(client, worker_auth_headers, test_shift):
    shift_id = test_shift.id

    response = client.delete(f"/shifts/{shift_id}", headers=worker_auth_headers)

    assert response.status_code == 204

    check = client.get(f"/shifts/{shift_id}", headers=worker_auth_headers)
    assert check.status_code == 404


def test_delete_other_workers_shift_forbidden(client, db_session, test_shift):
    other_worker = make_worker(db_session, "otherworker3@test.com")
    headers = auth_headers_for(other_worker)

    response = client.delete(f"/shifts/{test_shift.id}", headers=headers)
    assert response.status_code == 403


def test_delete_nonexistent_shift_returns_404(client, worker_auth_headers):
    response = client.delete("/shifts/99999", headers=worker_auth_headers)

    assert response.status_code == 404


def test_delete_shift_requires_auth(client, test_shift):
    response = client.delete(f"/shifts/{test_shift.id}")
    assert response.status_code == 401
