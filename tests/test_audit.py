from datetime import datetime, timedelta, timezone

from app.models.audit_log import AuditLog

from .conftest import auth_headers_for, make_worker


def _make_entry(
    db_session,
    *,
    user_id=None,
    user_role=None,
    method="POST",
    path="/residents/",
    status_code=201,
    duration_ms=42,
    detail=None,
    created_at=None,
):
    entry = AuditLog(
        user_id=user_id,
        user_role=user_role,
        method=method,
        path=path,
        status_code=status_code,
        duration_ms=duration_ms,
        detail=detail,
    )
    if created_at is not None:
        entry.created_at = created_at
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)
    return entry


# ---------------------------------------------------------------------------
# GET /audit/ -- auth / role gating
# ---------------------------------------------------------------------------

def test_list_audit_logs_requires_auth(client):
    response = client.get("/audit/")
    assert response.status_code == 401


def test_list_audit_logs_as_worker_forbidden(client, worker_auth_headers):
    response = client.get("/audit/", headers=worker_auth_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Manager role required"


def test_list_audit_logs_as_manager_success(client, manager_auth_headers, db_session):
    _make_entry(db_session)
    response = client.get("/audit/", headers=manager_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["results"]) == 1


# ---------------------------------------------------------------------------
# GET /audit/ -- pagination, ordering, empty state
# ---------------------------------------------------------------------------

def test_list_audit_logs_empty(client, manager_auth_headers):
    response = client.get("/audit/", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json() == {"total": 0, "results": []}


def test_list_audit_logs_ordered_most_recent_first(client, manager_auth_headers, db_session):
    now = datetime.now(timezone.utc)
    older = _make_entry(db_session, path="/older", created_at=now - timedelta(hours=2))
    newer = _make_entry(db_session, path="/newer", created_at=now)

    response = client.get("/audit/", headers=manager_auth_headers)
    assert response.status_code == 200
    paths = [r["path"] for r in response.json()["results"]]
    assert paths == ["/newer", "/older"]


def test_list_audit_logs_pagination(client, manager_auth_headers, db_session):
    now = datetime.now(timezone.utc)
    for i in range(5):
        _make_entry(db_session, path=f"/item-{i}", created_at=now - timedelta(minutes=i))

    response = client.get("/audit/?skip=2&limit=2", headers=manager_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 5
    assert len(body["results"]) == 2
    # skip=2 with most-recent-first ordering -> items 2 and 3 (0-indexed)
    assert body["results"][0]["path"] == "/item-2"
    assert body["results"][1]["path"] == "/item-3"


def test_list_audit_logs_limit_bounds_rejected(client, manager_auth_headers):
    # limit has le=200
    response = client.get("/audit/?limit=201", headers=manager_auth_headers)
    assert response.status_code == 422

    # skip has ge=0
    response = client.get("/audit/?skip=-1", headers=manager_auth_headers)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /audit/ -- filters
# ---------------------------------------------------------------------------

def test_list_audit_logs_filter_by_method(client, manager_auth_headers, db_session):
    _make_entry(db_session, method="POST", path="/a")
    _make_entry(db_session, method="DELETE", path="/b")

    response = client.get("/audit/?method=delete", headers=manager_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["method"] == "DELETE"


def test_list_audit_logs_filter_by_user_id(client, manager_auth_headers, test_user, db_session):
    _make_entry(db_session, user_id=test_user.id, path="/mine")
    _make_entry(db_session, user_id=None, path="/anon")

    response = client.get(f"/audit/?user_id={test_user.id}", headers=manager_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["path"] == "/mine"


def test_list_audit_logs_filter_by_path_substring(client, manager_auth_headers, db_session):
    _make_entry(db_session, path="/residents/42")
    _make_entry(db_session, path="/shifts/7")

    response = client.get("/audit/?path=resident", headers=manager_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["path"] == "/residents/42"


def test_list_audit_logs_filter_by_status_code(client, manager_auth_headers, db_session):
    _make_entry(db_session, status_code=201, path="/created")
    _make_entry(db_session, status_code=400, path="/bad")

    response = client.get("/audit/?status_code=400", headers=manager_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["path"] == "/bad"


def test_list_audit_logs_filter_by_date_range(client, manager_auth_headers, db_session):
    now = datetime.now(timezone.utc)
    _make_entry(db_session, path="/old", created_at=now - timedelta(days=10))
    _make_entry(db_session, path="/recent", created_at=now)

    date_from = (now - timedelta(days=1)).date().isoformat()
    response = client.get(f"/audit/?date_from={date_from}", headers=manager_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["path"] == "/recent"

    date_to = (now - timedelta(days=1)).date().isoformat()
    response = client.get(f"/audit/?date_to={date_to}", headers=manager_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["path"] == "/old"


def test_list_audit_logs_combined_filters_intersect(client, manager_auth_headers, db_session):
    _make_entry(db_session, method="POST", status_code=201, path="/match")
    _make_entry(db_session, method="POST", status_code=400, path="/wrong-status")
    _make_entry(db_session, method="DELETE", status_code=201, path="/wrong-method")

    response = client.get(
        "/audit/?method=POST&status_code=201", headers=manager_auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["path"] == "/match"


# ---------------------------------------------------------------------------
# GET /audit/ -- username resolution
# ---------------------------------------------------------------------------

def test_list_audit_logs_resolves_username_for_existing_user(
    client, manager_auth_headers, test_user, db_session
):
    _make_entry(db_session, user_id=test_user.id, path="/x")

    response = client.get("/audit/", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json()["results"][0]["username"] == test_user.username


def test_list_audit_logs_username_none_for_deleted_user(
    client, manager_auth_headers, db_session
):
    """user_id set but no matching User row (e.g. the user was later
    deleted) -- username should resolve to None rather than error."""
    _make_entry(db_session, user_id=999999, path="/orphaned")

    response = client.get("/audit/", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json()["results"][0]["username"] is None


def test_list_audit_logs_username_none_for_anonymous_entry(
    client, manager_auth_headers, db_session
):
    """user_id itself is None (unauthenticated request) -- no lookup
    should even be attempted, username stays None."""
    _make_entry(db_session, user_id=None, path="/anonymous")

    response = client.get("/audit/", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json()["results"][0]["username"] is None


def test_list_audit_logs_resolves_multiple_usernames_in_one_batch(
    client, manager_auth_headers, test_user, test_manager, db_session
):
    _make_entry(db_session, user_id=test_user.id, path="/from-worker")
    _make_entry(db_session, user_id=test_manager.id, path="/from-manager")

    response = client.get("/audit/", headers=manager_auth_headers)
    assert response.status_code == 200
    by_path = {r["path"]: r["username"] for r in response.json()["results"]}
    assert by_path["/from-worker"] == test_user.username
    assert by_path["/from-manager"] == test_manager.username


# ---------------------------------------------------------------------------
# GET /audit/{id}
# ---------------------------------------------------------------------------

def test_get_audit_log_success(client, manager_auth_headers, db_session):
    entry = _make_entry(db_session, path="/specific", detail="something happened")

    response = client.get(f"/audit/{entry.id}", headers=manager_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == entry.id
    assert body["path"] == "/specific"
    assert body["detail"] == "something happened"


def test_get_audit_log_resolves_username(client, manager_auth_headers, test_user, db_session):
    entry = _make_entry(db_session, user_id=test_user.id)

    response = client.get(f"/audit/{entry.id}", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json()["username"] == test_user.username


def test_get_audit_log_not_found(client, manager_auth_headers):
    response = client.get("/audit/99999", headers=manager_auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Audit log with id 99999 not found"


def test_get_audit_log_as_worker_forbidden(client, worker_auth_headers, db_session):
    entry = _make_entry(db_session)
    response = client.get(f"/audit/{entry.id}", headers=worker_auth_headers)
    assert response.status_code == 403


def test_get_audit_log_requires_auth(client, db_session):
    entry = _make_entry(db_session)
    response = client.get(f"/audit/{entry.id}")
    assert response.status_code == 401