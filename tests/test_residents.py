from app.models.notification import Notification
from app.models.resident import Resident


# ---------------------------------------------------------------------------
# POST /residents/  (manager only)
# ---------------------------------------------------------------------------

def test_create_resident_as_manager_success(client, manager_auth_headers):
    response = client.post(
        "/residents/", json={"name": "John Smith"}, headers=manager_auth_headers
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "John Smith"
    assert body["status"] == "active"
    assert body["discharged_at"] is None


def test_create_resident_as_worker_forbidden(client, worker_auth_headers):
    response = client.post(
        "/residents/", json={"name": "John Smith"}, headers=worker_auth_headers
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Manager role required"


def test_create_resident_requires_auth(client):
    response = client.post("/residents/", json={"name": "John Smith"})
    assert response.status_code == 401


def test_create_resident_missing_name_rejected(client, manager_auth_headers):
    response = client.post("/residents/", json={}, headers=manager_auth_headers)
    assert response.status_code == 422


def test_create_resident_empty_name_allowed_by_schema(client, manager_auth_headers):
    """The schema doesn't enforce a min length on name; document current
    (permissive) behavior rather than assume validation exists."""
    response = client.post("/residents/", json={"name": ""}, headers=manager_auth_headers)
    assert response.status_code == 201


# ---------------------------------------------------------------------------
# GET /residents/  (role-based visibility)
# ---------------------------------------------------------------------------

def test_list_residents_as_worker_only_shows_active(client, worker_auth_headers, db_session):
    active = Resident(name="Active Alice", status="active")
    discharged = Resident(name="Discharged Dan", status="discharged")
    db_session.add_all([active, discharged])
    db_session.commit()

    response = client.get("/residents/", headers=worker_auth_headers)

    assert response.status_code == 200
    names = [r["name"] for r in response.json()]
    assert "Active Alice" in names
    assert "Discharged Dan" not in names


def test_list_residents_as_manager_defaults_to_active_only(client, manager_auth_headers, db_session):
    active = Resident(name="Active Alice", status="active")
    discharged = Resident(name="Discharged Dan", status="discharged")
    db_session.add_all([active, discharged])
    db_session.commit()

    response = client.get("/residents/", headers=manager_auth_headers)

    assert response.status_code == 200
    names = [r["name"] for r in response.json()]
    assert "Active Alice" in names
    assert "Discharged Dan" not in names


def test_list_residents_as_manager_with_include_inactive(client, manager_auth_headers, db_session):
    active = Resident(name="Active Alice", status="active")
    discharged = Resident(name="Discharged Dan", status="discharged")
    db_session.add_all([active, discharged])
    db_session.commit()

    response = client.get("/residents/?include_inactive=true", headers=manager_auth_headers)

    assert response.status_code == 200
    names = [r["name"] for r in response.json()]
    assert "Active Alice" in names
    assert "Discharged Dan" in names


def test_list_residents_worker_cannot_bypass_filter_with_include_inactive(
    client, worker_auth_headers, db_session
):
    """include_inactive is only honored for managers; a worker should not
    be able to see discharged/deceased residents by passing it."""
    discharged = Resident(name="Discharged Dan", status="discharged")
    db_session.add(discharged)
    db_session.commit()

    response = client.get("/residents/?include_inactive=true", headers=worker_auth_headers)

    assert response.status_code == 200
    names = [r["name"] for r in response.json()]
    assert "Discharged Dan" not in names


def test_list_residents_requires_auth(client):
    response = client.get("/residents/")
    assert response.status_code == 401


def test_list_residents_pagination(client, manager_auth_headers, db_session):
    for i in range(5):
        db_session.add(Resident(name=f"Resident {i}", status="active"))
    db_session.commit()

    response = client.get("/residents/?skip=0&limit=2", headers=manager_auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_residents_limit_over_max_rejected(client, manager_auth_headers):
    response = client.get("/residents/?limit=500", headers=manager_auth_headers)
    assert response.status_code == 422


def test_list_residents_negative_skip_rejected(client, manager_auth_headers):
    response = client.get("/residents/?skip=-1", headers=manager_auth_headers)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /residents/{id}
# ---------------------------------------------------------------------------

def test_get_resident_by_id_success(client, worker_auth_headers, test_resident):
    response = client.get(f"/residents/{test_resident.id}", headers=worker_auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == test_resident.id


def test_get_resident_requires_auth(client, test_resident):
    response = client.get(f"/residents/{test_resident.id}")
    assert response.status_code == 401


def test_get_nonexistent_resident_returns_404(client, worker_auth_headers):
    response = client.get("/residents/99999", headers=worker_auth_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Resident with id 99999 not found"


def test_get_discharged_resident_still_viewable_by_id(client, worker_auth_headers, db_session):
    """The list endpoint hides discharged residents from workers, but a
    direct id lookup is not filtered by status — documents current
    behavior (there could be a legitimate need to view historical notes)."""
    discharged = Resident(name="Discharged Dan", status="discharged")
    db_session.add(discharged)
    db_session.commit()
    db_session.refresh(discharged)

    response = client.get(f"/residents/{discharged.id}", headers=worker_auth_headers)
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# PUT /residents/{id}  (manager only)
# ---------------------------------------------------------------------------

def test_update_resident_as_manager_success(client, manager_auth_headers, test_resident):
    response = client.put(
        f"/residents/{test_resident.id}",
        json={"name": "Jane Updated"},
        headers=manager_auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Jane Updated"


def test_update_resident_as_worker_forbidden(client, worker_auth_headers, test_resident):
    response = client.put(
        f"/residents/{test_resident.id}",
        json={"name": "Hacked Name"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


def test_update_nonexistent_resident_returns_404(client, manager_auth_headers):
    response = client.put(
        "/residents/99999", json={"name": "Ghost"}, headers=manager_auth_headers
    )
    assert response.status_code == 404


def test_update_resident_requires_auth(client, test_resident):
    response = client.put(f"/residents/{test_resident.id}", json={"name": "No Auth"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /residents/{id}/status  (manager only, generates notifications)
# ---------------------------------------------------------------------------

def test_update_resident_status_to_discharged_creates_notification(
    client, manager_auth_headers, test_resident, db_session
):
    response = client.patch(
        f"/residents/{test_resident.id}/status",
        json={"status": "discharged"},
        headers=manager_auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "discharged"
    assert body["discharged_at"] is not None

    notification = (
        db_session.query(Notification)
        .filter(Notification.resident_id == test_resident.id)
        .first()
    )
    assert notification is not None
    assert notification.urgency_flag == "high"
    assert test_resident.name in notification.message


def test_update_resident_status_to_deceased_creates_notification(
    client, manager_auth_headers, test_resident, db_session
):
    response = client.patch(
        f"/residents/{test_resident.id}/status",
        json={"status": "deceased"},
        headers=manager_auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "deceased"

    notification = (
        db_session.query(Notification)
        .filter(Notification.resident_id == test_resident.id)
        .first()
    )
    assert notification is not None


def test_update_resident_status_back_to_active_clears_discharged_at(
    client, manager_auth_headers, test_resident, db_session
):
    client.patch(
        f"/residents/{test_resident.id}/status",
        json={"status": "discharged"},
        headers=manager_auth_headers,
    )

    response = client.patch(
        f"/residents/{test_resident.id}/status",
        json={"status": "active"},
        headers=manager_auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert response.json()["discharged_at"] is None


def test_update_resident_status_to_active_does_not_create_notification(
    client, manager_auth_headers, test_resident, db_session
):
    before_count = db_session.query(Notification).count()

    response = client.patch(
        f"/residents/{test_resident.id}/status",
        json={"status": "active"},
        headers=manager_auth_headers,
    )

    assert response.status_code == 200
    after_count = db_session.query(Notification).count()
    assert after_count == before_count


def test_update_resident_status_invalid_value_rejected(client, manager_auth_headers, test_resident):
    response = client.patch(
        f"/residents/{test_resident.id}/status",
        json={"status": "on_vacation"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 422


def test_update_resident_status_as_worker_forbidden(client, worker_auth_headers, test_resident):
    response = client.patch(
        f"/residents/{test_resident.id}/status",
        json={"status": "discharged"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


def test_update_resident_status_nonexistent_resident_404(client, manager_auth_headers):
    response = client.patch(
        "/residents/99999/status", json={"status": "discharged"}, headers=manager_auth_headers
    )
    assert response.status_code == 404


def test_update_resident_status_requires_auth(client, test_resident):
    response = client.patch(
        f"/residents/{test_resident.id}/status", json={"status": "discharged"}
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /residents/{id}  (manager only)
# ---------------------------------------------------------------------------

def test_delete_resident_as_manager_success(client, manager_auth_headers, test_resident):
    resident_id = test_resident.id

    response = client.delete(f"/residents/{resident_id}", headers=manager_auth_headers)
    assert response.status_code == 204

    check = client.get(f"/residents/{resident_id}", headers=manager_auth_headers)
    assert check.status_code == 404


def test_delete_resident_as_worker_forbidden(client, worker_auth_headers, test_resident):
    response = client.delete(f"/residents/{test_resident.id}", headers=worker_auth_headers)
    assert response.status_code == 403


def test_delete_nonexistent_resident_returns_404(client, manager_auth_headers):
    response = client.delete("/residents/99999", headers=manager_auth_headers)
    assert response.status_code == 404


def test_delete_resident_requires_auth(client, test_resident):
    response = client.delete(f"/residents/{test_resident.id}")
    assert response.status_code == 401
