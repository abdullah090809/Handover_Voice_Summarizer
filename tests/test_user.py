from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models.password_reset import PasswordReset
from app.models.user import User

from .conftest import auth_headers_for, make_worker


# ---------------------------------------------------------------------------
# GET /users/me
# ---------------------------------------------------------------------------

def test_get_current_user_info(client, worker_auth_headers, test_user):
    response = client.get("/users/me", headers=worker_auth_headers)

    assert response.status_code == 200
    assert response.json()["email"] == test_user.email
    assert response.json()["role"] == "care_worker"


def test_get_current_user_requires_auth(client):
    response = client.get("/users/me")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /users/me/change-password
# ---------------------------------------------------------------------------

def test_change_password_success(client, worker_auth_headers, test_user):
    response = client.patch(
        "/users/me/change-password",
        json={"current_password": "password123", "new_password": "newpassword456"},
        headers=worker_auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Password changed successfully"

    login_response = client.post(
        "/login",
        data={"username": test_user.email, "password": "newpassword456"},
    )
    assert login_response.status_code == 200


def test_change_password_wrong_current_password_fails(client, worker_auth_headers):
    response = client.patch(
        "/users/me/change-password",
        json={"current_password": "wrongpassword", "new_password": "newpassword456"},
        headers=worker_auth_headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Current password is incorrect"


def test_change_password_new_password_too_short_rejected(client, worker_auth_headers):
    response = client.patch(
        "/users/me/change-password",
        json={"current_password": "password123", "new_password": "short"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 422


def test_change_password_requires_auth(client):
    response = client.patch(
        "/users/me/change-password",
        json={"current_password": "password123", "new_password": "newpassword456"},
    )
    assert response.status_code == 401


def test_change_password_old_password_no_longer_works(client, worker_auth_headers, test_user):
    client.patch(
        "/users/me/change-password",
        json={"current_password": "password123", "new_password": "newpassword456"},
        headers=worker_auth_headers,
    )

    old_login = client.post(
        "/login", data={"username": test_user.email, "password": "password123"}
    )
    assert old_login.status_code == 401


# ---------------------------------------------------------------------------
# GET /users/  and GET /users/{id}  (manager only)
# ---------------------------------------------------------------------------

def test_list_users_as_manager_success(client, manager_auth_headers, test_user, test_manager):
    response = client.get("/users/", headers=manager_auth_headers)

    assert response.status_code == 200
    emails = [u["email"] for u in response.json()]
    assert test_user.email in emails
    assert test_manager.email in emails


def test_list_users_as_worker_forbidden(client, worker_auth_headers):
    response = client.get("/users/", headers=worker_auth_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Manager role required"


def test_list_users_requires_auth(client):
    response = client.get("/users/")
    assert response.status_code == 401


def test_list_users_pagination(client, manager_auth_headers, db_session):
    for i in range(5):
        db_session.add(User(email=f"paguser{i}@test.com", password="x", role="care_worker"))
    db_session.commit()

    response = client.get("/users/?skip=0&limit=2", headers=manager_auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_users_limit_over_max_rejected(client, manager_auth_headers):
    response = client.get("/users/?limit=201", headers=manager_auth_headers)
    assert response.status_code == 422


def test_get_user_detail_as_manager_success(client, manager_auth_headers, test_user):
    response = client.get(f"/users/{test_user.id}", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json()["email"] == test_user.email


def test_get_user_detail_as_worker_forbidden(client, worker_auth_headers, test_manager):
    response = client.get(f"/users/{test_manager.id}", headers=worker_auth_headers)
    assert response.status_code == 403


def test_get_nonexistent_user_detail_404(client, manager_auth_headers):
    response = client.get("/users/99999", headers=manager_auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "User with id 99999 not found"


# ---------------------------------------------------------------------------
# POST /users/  (manager creates staff account directly, no OTP)
# ---------------------------------------------------------------------------

def test_create_user_as_manager_success(client, manager_auth_headers, db_session):
    response = client.post(
        "/users/",
        json={"email": "newstaff@test.com", "password": "securepass123", "role": "care_worker"},
        headers=manager_auth_headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "newstaff@test.com"
    assert body["role"] == "care_worker"

    user = db_session.query(User).filter(User.email == "newstaff@test.com").first()
    assert user is not None
    assert user.password != "securepass123"


def test_create_user_default_role_is_care_worker(client, manager_auth_headers):
    response = client.post(
        "/users/",
        json={"email": "defaultrole@test.com", "password": "securepass123"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["role"] == "care_worker"


def test_create_user_manager_role_success(client, manager_auth_headers):
    response = client.post(
        "/users/",
        json={"email": "newmanager@test.com", "password": "securepass123", "role": "manager"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["role"] == "manager"


def test_create_user_invalid_role_rejected(client, manager_auth_headers):
    response = client.post(
        "/users/",
        json={"email": "badrole@test.com", "password": "securepass123", "role": "superadmin"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 422


def test_create_user_duplicate_email_fails(client, manager_auth_headers, test_user):
    response = client.post(
        "/users/",
        json={"email": test_user.email, "password": "securepass123"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_create_user_as_worker_forbidden(client, worker_auth_headers):
    response = client.post(
        "/users/",
        json={"email": "sneaky@test.com", "password": "securepass123"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


def test_create_user_requires_auth(client):
    response = client.post(
        "/users/", json={"email": "noauth@test.com", "password": "securepass123"}
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# PATCH/PUT /users/{id}
# ---------------------------------------------------------------------------

def test_update_user_email_as_manager_success(client, manager_auth_headers, test_user):
    response = client.patch(
        f"/users/{test_user.id}",
        json={"email": "updated@test.com"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["email"] == "updated@test.com"


def test_update_user_via_put_also_works(client, manager_auth_headers, test_user):
    response = client.put(
        f"/users/{test_user.id}",
        json={"role": "manager"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["role"] == "manager"


def test_update_user_password_success(client, manager_auth_headers, test_user):
    response = client.patch(
        f"/users/{test_user.id}",
        json={"password": "brandnewpass123"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200

    login_resp = client.post(
        "/login", data={"username": test_user.email, "password": "brandnewpass123"}
    )
    assert login_resp.status_code == 200


def test_update_user_duplicate_email_rejected(client, manager_auth_headers, test_user, test_manager):
    response = client.patch(
        f"/users/{test_user.id}",
        json={"email": test_manager.email},
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_update_user_same_email_on_self_allowed(client, manager_auth_headers, test_user):
    """Setting a user's email to the value it already has should not be
    rejected as a duplicate (the query excludes the user's own id)."""
    response = client.patch(
        f"/users/{test_user.id}",
        json={"email": test_user.email},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200


def test_update_nonexistent_user_404(client, manager_auth_headers):
    response = client.patch(
        "/users/99999", json={"email": "ghost@test.com"}, headers=manager_auth_headers
    )
    assert response.status_code == 404


def test_update_user_invalid_role_rejected(client, manager_auth_headers, test_user):
    response = client.patch(
        f"/users/{test_user.id}", json={"role": "root"}, headers=manager_auth_headers
    )
    assert response.status_code == 422


def test_update_user_as_worker_forbidden(client, worker_auth_headers, test_manager):
    response = client.patch(
        f"/users/{test_manager.id}", json={"email": "x@test.com"}, headers=worker_auth_headers
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /users/{id}
# ---------------------------------------------------------------------------

def test_delete_user_as_manager_success(client, manager_auth_headers, test_user):
    response = client.delete(f"/users/{test_user.id}", headers=manager_auth_headers)
    assert response.status_code == 204

    check = client.get(f"/users/{test_user.id}", headers=manager_auth_headers)
    assert check.status_code == 404


def test_delete_own_account_forbidden(client, manager_auth_headers, test_manager):
    response = client.delete(f"/users/{test_manager.id}", headers=manager_auth_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot delete your own account"


def test_delete_nonexistent_user_404(client, manager_auth_headers):
    response = client.delete("/users/99999", headers=manager_auth_headers)
    assert response.status_code == 404


def test_delete_user_as_worker_forbidden(client, worker_auth_headers, test_manager):
    response = client.delete(f"/users/{test_manager.id}", headers=worker_auth_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# PATCH /users/{id}/deactivate and /activate
# ---------------------------------------------------------------------------

def test_deactivate_user_success(client, manager_auth_headers, test_user):
    response = client.patch(f"/users/{test_user.id}/deactivate", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json()["role"] == "deactivated"


def test_deactivated_user_role_is_restorable_on_activate(client, manager_auth_headers, test_user):
    client.patch(f"/users/{test_user.id}/deactivate", headers=manager_auth_headers)

    response = client.patch(f"/users/{test_user.id}/activate", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json()["role"] == "care_worker"


def test_activate_falls_back_to_care_worker_if_no_previous_role(
    client, manager_auth_headers, test_user, db_session
):
    test_user.role = "deactivated"
    test_user.previous_role = None
    db_session.commit()

    response = client.patch(f"/users/{test_user.id}/activate", headers=manager_auth_headers)
    assert response.status_code == 200
    assert response.json()["role"] == "care_worker"


def test_deactivate_already_deactivated_user_fails(client, manager_auth_headers, test_user):
    client.patch(f"/users/{test_user.id}/deactivate", headers=manager_auth_headers)

    response = client.patch(f"/users/{test_user.id}/deactivate", headers=manager_auth_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "User is already deactivated"


def test_activate_user_that_is_not_deactivated_fails(client, manager_auth_headers, test_user):
    response = client.patch(f"/users/{test_user.id}/activate", headers=manager_auth_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "User is not deactivated"


def test_deactivate_own_account_forbidden(client, manager_auth_headers, test_manager):
    response = client.patch(f"/users/{test_manager.id}/deactivate", headers=manager_auth_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot deactivate your own account"


def test_deactivate_nonexistent_user_404(client, manager_auth_headers):
    response = client.patch("/users/99999/deactivate", headers=manager_auth_headers)
    assert response.status_code == 404


def test_deactivate_as_worker_forbidden(client, worker_auth_headers, test_manager):
    response = client.patch(f"/users/{test_manager.id}/deactivate", headers=worker_auth_headers)
    assert response.status_code == 403


def test_deactivated_user_token_still_authenticates_but_loses_role_permissions(
    client, manager_auth_headers, test_user
):
    """Deactivation doesn't revoke existing JWTs (no server-side session
    store), but the user's new role should no longer pass require_manager
    or role-specific checks."""
    headers = auth_headers_for(test_user)
    client.patch(f"/users/{test_user.id}/deactivate", headers=manager_auth_headers)

    me_resp = client.get("/users/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["role"] == "deactivated"


# ---------------------------------------------------------------------------
# PATCH /users/{id}/reset-password  (manager resets staff password)
# ---------------------------------------------------------------------------

def test_manager_reset_user_password_success(client, manager_auth_headers, test_user):
    response = client.patch(
        f"/users/{test_user.id}/reset-password",
        json={"new_password": "resetbymanager123"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Password reset successfully"

    login_resp = client.post(
        "/login", data={"username": test_user.email, "password": "resetbymanager123"}
    )
    assert login_resp.status_code == 200


def test_manager_reset_user_password_too_short_rejected(client, manager_auth_headers, test_user):
    response = client.patch(
        f"/users/{test_user.id}/reset-password",
        json={"new_password": "short"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Password must be at least 8 characters"


def test_manager_reset_password_nonexistent_user_404(client, manager_auth_headers):
    response = client.patch(
        "/users/99999/reset-password",
        json={"new_password": "resetbymanager123"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 404


def test_manager_reset_password_as_worker_forbidden(client, worker_auth_headers, test_manager):
    response = client.patch(
        f"/users/{test_manager.id}/reset-password",
        json={"new_password": "resetbymanager123"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /forgot-password  and POST /reset-password  (self-service, OTP based)
# ---------------------------------------------------------------------------

def test_forgot_password_existing_user_sends_email(client, test_user, db_session):
    with patch("app.routers.auth.send_password_reset_email") as mock_send:
        response = client.post("/forgot-password", json={"email": test_user.email})

    assert response.status_code == 200
    mock_send.assert_called_once()

    reset = db_session.query(PasswordReset).filter(PasswordReset.email == test_user.email).first()
    assert reset is not None
    assert reset.otp_code is not None


def test_forgot_password_nonexistent_email_returns_generic_message(client):
    with patch("app.routers.auth.send_password_reset_email") as mock_send:
        response = client.post("/forgot-password", json={"email": "doesnotexist@test.com"})

    assert response.status_code == 200
    assert "If that email is registered" in response.json()["message"]
    mock_send.assert_not_called()


def test_forgot_password_does_not_leak_existence_via_status_code(client, test_user):
    """Both existing and nonexistent emails must return identical status
    codes/messages so the endpoint can't be used to enumerate accounts."""
    with patch("app.routers.auth.send_password_reset_email"):
        existing_resp = client.post("/forgot-password", json={"email": test_user.email})
    missing_resp = client.post("/forgot-password", json={"email": "nobody@test.com"})

    assert existing_resp.status_code == missing_resp.status_code == 200
    assert existing_resp.json() == missing_resp.json()


def test_forgot_password_rate_limited_after_five_requests(client, test_user):
    with patch("app.routers.auth.send_password_reset_email"):
        for _ in range(5):
            resp = client.post("/forgot-password", json={"email": test_user.email})
            assert resp.status_code == 200

        sixth = client.post("/forgot-password", json={"email": test_user.email})

    assert sixth.status_code == 429


def test_reset_password_with_correct_otp_succeeds(client, test_user, db_session):
    with patch("app.routers.auth.send_password_reset_email"):
        client.post("/forgot-password", json={"email": test_user.email})

    reset = db_session.query(PasswordReset).filter(PasswordReset.email == test_user.email).first()
    otp_code = reset.otp_code

    response = client.post(
        "/reset-password",
        json={"email": test_user.email, "otp_code": otp_code, "new_password": "resetpassword789"},
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Password reset successfully"

    login_response = client.post(
        "/login", data={"username": test_user.email, "password": "resetpassword789"}
    )
    assert login_response.status_code == 200

    # reset row must be single-use
    reset_after = db_session.query(PasswordReset).filter(PasswordReset.email == test_user.email).first()
    assert reset_after is None


def test_reset_password_with_wrong_otp_fails(client, test_user):
    with patch("app.routers.auth.send_password_reset_email"):
        client.post("/forgot-password", json={"email": test_user.email})

    response = client.post(
        "/reset-password",
        json={"email": test_user.email, "otp_code": "000000", "new_password": "resetpassword789"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid reset code"


def test_reset_password_no_pending_reset_fails(client, test_user):
    response = client.post(
        "/reset-password",
        json={"email": test_user.email, "otp_code": "123456", "new_password": "resetpassword789"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid or expired reset code"


def test_reset_password_expired_otp_fails(client, test_user, db_session):
    with patch("app.routers.auth.send_password_reset_email"):
        client.post("/forgot-password", json={"email": test_user.email})

    reset = db_session.query(PasswordReset).filter(PasswordReset.email == test_user.email).first()
    reset.otp_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    response = client.post(
        "/reset-password",
        json={"email": test_user.email, "otp_code": reset.otp_code, "new_password": "resetpassword789"},
    )

    assert response.status_code == 400
    assert "expired" in response.json()["detail"].lower()


def test_reset_password_new_password_too_short_rejected(client, test_user):
    with patch("app.routers.auth.send_password_reset_email"):
        client.post("/forgot-password", json={"email": test_user.email})

    response = client.post(
        "/reset-password",
        json={"email": test_user.email, "otp_code": "123456", "new_password": "short"},
    )
    assert response.status_code == 422


def test_reset_password_otp_cannot_be_reused(client, test_user, db_session):
    with patch("app.routers.auth.send_password_reset_email"):
        client.post("/forgot-password", json={"email": test_user.email})

    reset = db_session.query(PasswordReset).filter(PasswordReset.email == test_user.email).first()
    otp_code = reset.otp_code

    first = client.post(
        "/reset-password",
        json={"email": test_user.email, "otp_code": otp_code, "new_password": "firstreset123"},
    )
    assert first.status_code == 200

    second = client.post(
        "/reset-password",
        json={"email": test_user.email, "otp_code": otp_code, "new_password": "secondreset123"},
    )
    assert second.status_code == 400
