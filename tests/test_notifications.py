from app.models.notification import Notification


def _make_notification(db_session, **overrides):
    defaults = dict(message="Test notification", urgency_flag="high", resident_id=None, handover_note_id=None)
    defaults.update(overrides)
    notification = Notification(**defaults)
    db_session.add(notification)
    db_session.commit()
    db_session.refresh(notification)
    return notification


# ---------------------------------------------------------------------------
# GET /notifications/  (manager only)
# ---------------------------------------------------------------------------

def test_list_notifications_as_manager_success(client, manager_auth_headers, db_session):
    _make_notification(db_session, message="Resident fell")

    response = client.get("/notifications/", headers=manager_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 1
    assert body[0]["message"] == "Resident fell"


def test_list_notifications_as_worker_forbidden(client, worker_auth_headers):
    response = client.get("/notifications/", headers=worker_auth_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Manager role required"


def test_list_notifications_requires_auth(client):
    response = client.get("/notifications/")
    assert response.status_code == 401


def test_list_notifications_ordered_newest_first(client, manager_auth_headers, db_session):
    first = _make_notification(db_session, message="First")
    second = _make_notification(db_session, message="Second")

    response = client.get("/notifications/", headers=manager_auth_headers)

    assert response.status_code == 200
    ids = [n["id"] for n in response.json()]
    assert ids.index(second.id) < ids.index(first.id)


def test_list_notifications_pagination(client, manager_auth_headers, db_session):
    for i in range(5):
        _make_notification(db_session, message=f"Notification {i}")

    response = client.get("/notifications/?skip=0&limit=2", headers=manager_auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_notifications_limit_over_max_rejected(client, manager_auth_headers):
    response = client.get("/notifications/?limit=500", headers=manager_auth_headers)
    assert response.status_code == 422


def test_list_notifications_empty_when_none_exist(client, manager_auth_headers):
    response = client.get("/notifications/", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# PATCH /notifications/{id}/read
# ---------------------------------------------------------------------------

def test_mark_notification_as_read_success(client, manager_auth_headers, db_session):
    notification = _make_notification(db_session)
    assert notification.is_read is False

    response = client.patch(f"/notifications/{notification.id}/read", headers=manager_auth_headers)

    assert response.status_code == 200
    assert response.json()["is_read"] is True


def test_mark_notification_as_read_idempotent(client, manager_auth_headers, db_session):
    notification = _make_notification(db_session)

    first = client.patch(f"/notifications/{notification.id}/read", headers=manager_auth_headers)
    second = client.patch(f"/notifications/{notification.id}/read", headers=manager_auth_headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["is_read"] is True


def test_mark_nonexistent_notification_as_read_404(client, manager_auth_headers):
    response = client.patch("/notifications/99999/read", headers=manager_auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Notification not found"


def test_mark_notification_as_read_as_worker_forbidden(client, worker_auth_headers, db_session):
    notification = _make_notification(db_session)

    response = client.patch(f"/notifications/{notification.id}/read", headers=worker_auth_headers)
    assert response.status_code == 403


def test_mark_notification_as_read_requires_auth(client, db_session):
    notification = _make_notification(db_session)

    response = client.patch(f"/notifications/{notification.id}/read")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /notifications/read-all
# ---------------------------------------------------------------------------

def test_mark_all_as_read_success(client, manager_auth_headers, db_session):
    _make_notification(db_session, message="One")
    _make_notification(db_session, message="Two")

    response = client.post("/notifications/read-all", headers=manager_auth_headers)

    assert response.status_code == 200
    assert response.json()["message"] == "All notifications marked as read."

    remaining_unread = db_session.query(Notification).filter(Notification.is_read == False).count()  # noqa: E712
    assert remaining_unread == 0


def test_mark_all_as_read_does_not_affect_already_read(client, manager_auth_headers, db_session):
    already_read = _make_notification(db_session, message="Already read")
    already_read.is_read = True
    db_session.commit()

    response = client.post("/notifications/read-all", headers=manager_auth_headers)
    assert response.status_code == 200


def test_mark_all_as_read_with_no_notifications_succeeds(client, manager_auth_headers):
    response = client.post("/notifications/read-all", headers=manager_auth_headers)
    assert response.status_code == 200


def test_mark_all_as_read_as_worker_forbidden(client, worker_auth_headers):
    response = client.post("/notifications/read-all", headers=worker_auth_headers)
    assert response.status_code == 403


def test_mark_all_as_read_requires_auth(client):
    response = client.post("/notifications/read-all")
    assert response.status_code == 401
