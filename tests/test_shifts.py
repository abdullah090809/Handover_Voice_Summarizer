from datetime import datetime, timezone
from app.cores.security import create_access_token, hash_password
from app.models.user import User
from app.models.shift import Shift
from app.cores.security import create_access_token, hash_password
from app.models.user import User


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


def test_create_shift_requires_auth(client):
    response = client.post(
        "/shifts/",
        json={"start_time": datetime.now(timezone.utc).isoformat()},
    )
    assert response.status_code == 401


def test_list_my_shifts_only_returns_own_shifts(client, worker_auth_headers, test_shift, test_manager, db_session):
    other_shift = Shift(worker_id=test_manager.id, start_time=datetime.now(timezone.utc))
    db_session.add(other_shift)
    db_session.commit()

    response = client.get("/shifts/", headers=worker_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert all(s["worker_id"] == test_shift.worker_id for s in body)
    assert any(s["id"] == test_shift.id for s in body)


def test_get_own_shift_success(client, worker_auth_headers, test_shift):
    response = client.get(f"/shifts/{test_shift.id}", headers=worker_auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == test_shift.id


def test_get_other_workers_shift_forbidden(client, manager_auth_headers, test_shift):
    response = client.get(f"/shifts/{test_shift.id}", headers=manager_auth_headers)

    assert response.status_code == 200


def test_get_other_workers_shift_forbidden_as_non_manager(client, db_session, test_care_home, test_shift):

    other_worker = User(
        email="otherworker@test.com",
        password=hash_password("password123"),
        role="care_worker",
        care_home_id=test_care_home.id,
    )
    db_session.add(other_worker)
    db_session.commit()
    db_session.refresh(other_worker)

    token = create_access_token(data={"user_id": str(other_worker.id)})
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get(f"/shifts/{test_shift.id}", headers=headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized to view this shift"


def test_get_nonexistent_shift_returns_404(client, worker_auth_headers):
    response = client.get("/shifts/99999", headers=worker_auth_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Shift with id 99999 not found"


def test_update_own_shift_success(client, worker_auth_headers, test_shift):
    new_start = datetime.now(timezone.utc).isoformat()
    response = client.put(
        f"/shifts/{test_shift.id}",
        json={"start_time": new_start},
        headers=worker_auth_headers,
    )

    assert response.status_code == 200


def test_update_other_workers_shift_forbidden(client, db_session, test_care_home, test_shift):
    other_worker = User(
        email="otherworker2@test.com",
        password=hash_password("password123"),
        role="care_worker",
        care_home_id=test_care_home.id,
    )
    db_session.add(other_worker)
    db_session.commit()
    db_session.refresh(other_worker)

    token = create_access_token(data={"user_id": str(other_worker.id)})
    headers = {"Authorization": f"Bearer {token}"}

    response = client.put(
        f"/shifts/{test_shift.id}",
        json={"start_time": datetime.now(timezone.utc).isoformat()},
        headers=headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized to update this shift"


def test_delete_own_shift_success(client, worker_auth_headers, test_shift):
    shift_id = test_shift.id

    response = client.delete(f"/shifts/{shift_id}", headers=worker_auth_headers)

    assert response.status_code == 204

    check = client.get(f"/shifts/{shift_id}", headers=worker_auth_headers)
    assert check.status_code == 404


def test_delete_nonexistent_shift_returns_404(client, worker_auth_headers):
    response = client.delete("/shifts/99999", headers=worker_auth_headers)

    assert response.status_code == 404