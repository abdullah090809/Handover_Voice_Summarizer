import io
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models.assignment import ResidentAssignment
from app.models.password_reset import PasswordReset
from app.models.resident import Resident
from app.models.user import User

from .conftest import auth_headers_for, make_worker


def _fake_image_file(filename="avatar.jpg", content_type="image/jpeg", body=b"fake image bytes"):
    return {"file": (filename, io.BytesIO(body), content_type)}


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
        db_session.add(User(email=f"paguser{i}@test.com", username=f"paguser{i}", password="x", role="care_worker"))
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
        json={"email": "newstaff@test.com", "username": "newstaffuser", "password": "securepass123", "role": "care_worker"},
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
        json={"email": "defaultrole@test.com", "username": "defaultroleuser", "password": "securepass123"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["role"] == "care_worker"


def test_create_user_manager_role_success(client, manager_auth_headers):
    response = client.post(
        "/users/",
        json={"email": "newmanager@test.com", "username": "newmanageruser", "password": "securepass123", "role": "manager"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["role"] == "manager"


def test_create_user_invalid_role_rejected(client, manager_auth_headers):
    response = client.post(
        "/users/",
        json={"email": "badrole@test.com", "username": "badroleuser", "password": "securepass123", "role": "superadmin"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 422


def test_create_user_duplicate_email_fails(client, manager_auth_headers, test_user):
    response = client.post(
        "/users/",
        json={"email": test_user.email, "username": "dupeemailuser", "password": "securepass123"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_create_user_as_worker_forbidden(client, worker_auth_headers):
    response = client.post(
        "/users/",
        json={"email": "sneaky@test.com", "username": "sneakyuser", "password": "securepass123"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 403


def test_create_user_requires_auth(client):
    response = client.post(
        "/users/", json={"email": "noauth@test.com", "username": "noauthuser", "password": "securepass123"}
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
    """Deactivation immediately revokes existing JWTs via the Redis blocklist."""
    headers = auth_headers_for(test_user)
    client.patch(f"/users/{test_user.id}/deactivate", headers=manager_auth_headers)

    me_resp = client.get("/users/me", headers=headers)
    assert me_resp.status_code == 401



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
    with patch("app.routers.auth.send_password_reset_email_task") as mock_send:
        response = client.post("/forgot-password", json={"email": test_user.email})

    assert response.status_code == 200
    mock_send.delay.assert_called_once()

    reset = db_session.query(PasswordReset).filter(PasswordReset.email == test_user.email).first()
    assert reset is not None
    assert reset.otp_code is not None


def test_forgot_password_nonexistent_email_returns_generic_message(client):
    with patch("app.routers.auth.send_password_reset_email_task") as mock_send:
        response = client.post("/forgot-password", json={"email": "doesnotexist@test.com"})

    assert response.status_code == 200
    assert "If that email is registered" in response.json()["message"]
    mock_send.delay.assert_not_called()


def test_forgot_password_does_not_leak_existence_via_status_code(client, test_user):
    """Both existing and nonexistent emails must return identical status
    codes/messages so the endpoint can't be used to enumerate accounts."""
    with patch("app.routers.auth.send_password_reset_email_task"):
        existing_resp = client.post("/forgot-password", json={"email": test_user.email})
    missing_resp = client.post("/forgot-password", json={"email": "nobody@test.com"})

    assert existing_resp.status_code == missing_resp.status_code == 200
    assert existing_resp.json() == missing_resp.json()


def test_forgot_password_rate_limited_after_five_requests(client, test_user):
    with patch("app.routers.auth.send_password_reset_email_task"):
        for _ in range(5):
            resp = client.post("/forgot-password", json={"email": test_user.email})
            assert resp.status_code == 200

        sixth = client.post("/forgot-password", json={"email": test_user.email})

    assert sixth.status_code == 429


def test_reset_password_with_correct_otp_succeeds(client, test_user, db_session):
    with patch("app.routers.auth.send_password_reset_email_task"):
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
    with patch("app.routers.auth.send_password_reset_email_task"):
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
    with patch("app.routers.auth.send_password_reset_email_task"):
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
    with patch("app.routers.auth.send_password_reset_email_task"):
        client.post("/forgot-password", json={"email": test_user.email})

    response = client.post(
        "/reset-password",
        json={"email": test_user.email, "otp_code": "123456", "new_password": "short"},
    )
    assert response.status_code == 422


def test_reset_password_otp_cannot_be_reused(client, test_user, db_session):
    with patch("app.routers.auth.send_password_reset_email_task"):
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

# ---------------------------------------------------------------------------
# PATCH /users/me
# ---------------------------------------------------------------------------

def test_update_current_user_basic_fields(client, worker_auth_headers, test_user):
    response = client.patch(
        "/users/me",
        json={"name": "New Name", "job_title": "Senior Carer"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "New Name"
    assert body["job_title"] == "Senior Carer"


def test_update_current_user_username_success(client, worker_auth_headers, test_user):
    response = client.patch(
        "/users/me", json={"username": "brandnewname"}, headers=worker_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["username"] == "brandnewname"


def test_update_current_user_username_unchanged_noop(client, worker_auth_headers, test_user):
    """Passing your own current username back is a no-op, not a conflict."""
    response = client.patch(
        "/users/me", json={"username": test_user.username}, headers=worker_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["username"] == test_user.username


def test_update_current_user_username_taken_rejected(
    client, worker_auth_headers, db_session
):
    other = make_worker(db_session, email="taken@test.com", username="takenname")
    response = client.patch(
        "/users/me", json={"username": "takenname"}, headers=worker_auth_headers
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Username already taken"


def test_update_current_user_empty_username_ignored(client, worker_auth_headers, test_user):
    """username can never be cleared -- an empty/None value is silently ignored."""
    response = client.patch(
        "/users/me", json={"username": None}, headers=worker_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["username"] == test_user.username


def test_update_current_user_requires_auth(client):
    response = client.patch("/users/me", json={"name": "X"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /users/me/profile-picture
# ---------------------------------------------------------------------------

def test_upload_profile_picture_success(client, worker_auth_headers, tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.user.PROFILE_PICTURE_DIR", str(tmp_path))

    response = client.post(
        "/users/me/profile-picture",
        files=_fake_image_file(),
        headers=worker_auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["profile_photo_url"].startswith("/static/profile_pictures/")
    assert body["profile_photo_url"].endswith(".jpg")


def test_upload_profile_picture_png_and_webp_allowed(
    client, worker_auth_headers, tmp_path, monkeypatch
):
    monkeypatch.setattr("app.routers.user.PROFILE_PICTURE_DIR", str(tmp_path))

    for content_type, ext in [("image/png", "png"), ("image/webp", "webp")]:
        response = client.post(
            "/users/me/profile-picture",
            files=_fake_image_file(filename=f"avatar.{ext}", content_type=content_type),
            headers=worker_auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["profile_photo_url"].endswith(f".{ext}")


def test_upload_profile_picture_invalid_content_type_rejected(
    client, worker_auth_headers, tmp_path, monkeypatch
):
    monkeypatch.setattr("app.routers.user.PROFILE_PICTURE_DIR", str(tmp_path))

    response = client.post(
        "/users/me/profile-picture",
        files=_fake_image_file(filename="doc.pdf", content_type="application/pdf"),
        headers=worker_auth_headers,
    )
    assert response.status_code == 400
    assert "JPEG, PNG, or WEBP" in response.json()["detail"]


def test_upload_profile_picture_too_large_rejected(
    client, worker_auth_headers, tmp_path, monkeypatch
):
    monkeypatch.setattr("app.routers.user.PROFILE_PICTURE_DIR", str(tmp_path))
    oversized = b"x" * (5 * 1024 * 1024 + 1)

    response = client.post(
        "/users/me/profile-picture",
        files=_fake_image_file(body=oversized),
        headers=worker_auth_headers,
    )
    assert response.status_code == 400
    assert "smaller than 5MB" in response.json()["detail"]

    # The rejected partial upload must not have been left on disk.
    assert list(tmp_path.iterdir()) == []


def test_upload_profile_picture_replaces_previous(
    client, worker_auth_headers, tmp_path, monkeypatch, test_user, db_session
):
    monkeypatch.setattr("app.routers.user.PROFILE_PICTURE_DIR", str(tmp_path))

    first = client.post(
        "/users/me/profile-picture",
        files=_fake_image_file(filename="first.jpg"),
        headers=worker_auth_headers,
    )
    assert first.status_code == 200

    second = client.post(
        "/users/me/profile-picture",
        files=_fake_image_file(filename="second.jpg"),
        headers=worker_auth_headers,
    )
    assert second.status_code == 200
    assert second.json()["profile_photo_url"] != first.json()["profile_photo_url"]


def test_upload_profile_picture_requires_auth(client):
    response = client.post("/users/me/profile-picture", files=_fake_image_file())
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /users/me/profile-picture
# ---------------------------------------------------------------------------

def test_delete_profile_picture_clears_url(
    client, worker_auth_headers, tmp_path, monkeypatch, test_user, db_session
):
    monkeypatch.setattr("app.routers.user.PROFILE_PICTURE_DIR", str(tmp_path))
    client.post(
        "/users/me/profile-picture", files=_fake_image_file(), headers=worker_auth_headers
    )

    response = client.delete("/users/me/profile-picture", headers=worker_auth_headers)
    assert response.status_code == 200
    assert response.json()["profile_photo_url"] is None

    db_session.refresh(test_user)
    assert test_user.profile_photo_url is None


def test_delete_profile_picture_when_none_set_is_safe(client, worker_auth_headers):
    response = client.delete("/users/me/profile-picture", headers=worker_auth_headers)
    assert response.status_code == 200
    assert response.json()["profile_photo_url"] is None


def test_delete_profile_picture_requires_auth(client):
    response = client.delete("/users/me/profile-picture")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /users -- duplicate username / employee_id
# ---------------------------------------------------------------------------

def test_create_user_duplicate_username_rejected(client, manager_auth_headers, test_user):
    response = client.post(
        "/users/",
        json={
            "email": "brandnew@test.com",
            "username": test_user.username,
            "password": "password123",
        },
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Username already taken"


def test_create_user_duplicate_employee_id_rejected(
    client, manager_auth_headers, test_user, db_session
):
    test_user.employee_id = "EMP-0099"
    db_session.commit()

    response = client.post(
        "/users/",
        json={
            "email": "brandnew2@test.com",
            "username": "brandnew2",
            "password": "password123",
            "employee_id": "EMP-0099",
        },
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Employee ID already in use"


def test_create_user_auto_generates_employee_id(client, manager_auth_headers):
    response = client.post(
        "/users/",
        json={
            "email": "autoid@test.com",
            "username": "autoid",
            "password": "password123",
            "role": "care_worker",
        },
        headers=manager_auth_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["employee_id"] is not None
    assert body["employee_id"].startswith("EMP-")


def test_create_manager_auto_generates_mgr_prefixed_employee_id(
    client, manager_auth_headers
):
    response = client.post(
        "/users/",
        json={
            "email": "automgr@test.com",
            "username": "automgr",
            "password": "password123",
            "role": "manager",
        },
        headers=manager_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["employee_id"].startswith("MGR-")


# ---------------------------------------------------------------------------
# PATCH/PUT /users/{id} -- username, password, employee_id, employment_status
# ---------------------------------------------------------------------------

def test_update_user_username_success(client, manager_auth_headers, test_user):
    response = client.patch(
        f"/users/{test_user.id}", json={"username": "updatedname"}, headers=manager_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["username"] == "updatedname"


def test_update_user_username_taken_rejected(
    client, manager_auth_headers, test_user, db_session
):
    other = make_worker(db_session, email="other-taken@test.com", username="othertaken")
    response = client.patch(
        f"/users/{test_user.id}", json={"username": "othertaken"}, headers=manager_auth_headers
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Username already taken"


def test_update_user_employee_id_taken_rejected(
    client, manager_auth_headers, test_user, test_manager, db_session
):
    test_manager.employee_id = "MGR-0050"
    db_session.commit()

    response = client.patch(
        f"/users/{test_user.id}",
        json={"employee_id": "MGR-0050"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Employee ID already in use"


def test_update_user_employment_status_to_left_blocklists_token(
    client, manager_auth_headers, test_user
):
    """Setting employment_status to 'left' should immediately revoke the
    user's existing token, mirroring deactivate's blocklist behaviour."""
    headers = auth_headers_for(test_user)

    response = client.patch(
        f"/users/{test_user.id}",
        json={"employment_status": "left"},
        headers=manager_auth_headers,
    )
    assert response.status_code == 200

    me_resp = client.get("/users/me", headers=headers)
    assert me_resp.status_code == 401


def test_update_user_employment_status_from_left_clears_blocklist(
    client, manager_auth_headers, test_user
):
    """Moving a user's employment_status back off 'left' should clear the
    blocklist so their next fresh token isn't immediately rejected."""
    client.patch(
        f"/users/{test_user.id}",
        json={"employment_status": "left"},
        headers=manager_auth_headers,
    )
    client.patch(
        f"/users/{test_user.id}",
        json={"employment_status": "active"},
        headers=manager_auth_headers,
    )

    fresh_headers = auth_headers_for(test_user)
    me_resp = client.get("/users/me", headers=fresh_headers)
    assert me_resp.status_code == 200


# ---------------------------------------------------------------------------
# PATCH /users/{id}/deactivate -- blocked by active caseload
# ---------------------------------------------------------------------------

def test_deactivate_care_worker_with_active_residents_blocked(
    client, manager_auth_headers, test_user, db_session
):
    resident = Resident(name="Active Resident", status="active")
    db_session.add(resident)
    db_session.commit()
    db_session.refresh(resident)
    db_session.add(
        ResidentAssignment(resident_id=resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()

    response = client.patch(
        f"/users/{test_user.id}/deactivate", headers=manager_auth_headers
    )
    assert response.status_code == 400
    assert "still have 1 active resident" in response.json()["detail"]


def test_deactivate_care_worker_with_only_discharged_residents_allowed(
    client, manager_auth_headers, test_user, db_session
):
    resident = Resident(name="Discharged Resident", status="discharged")
    db_session.add(resident)
    db_session.commit()
    db_session.refresh(resident)
    db_session.add(
        ResidentAssignment(resident_id=resident.id, care_worker_id=test_user.id)
    )
    db_session.commit()

    response = client.patch(
        f"/users/{test_user.id}/deactivate", headers=manager_auth_headers
    )
    assert response.status_code == 200