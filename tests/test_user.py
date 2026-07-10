from unittest.mock import patch
from app.models.password_reset import PasswordReset
from app.models.care_home import CareHome
from app.models.password_reset import PasswordReset

def test_get_current_user_info(client, worker_auth_headers, test_user):
    response = client.get("/users/me", headers=worker_auth_headers)

    assert response.status_code == 200
    assert response.json()["email"] == test_user.email

def test_get_current_user_requires_auth(client):
    response = client.get("/users/me")

    assert response.status_code == 401

def test_assign_care_home_as_manager_success(client, manager_auth_headers, test_user, db_session):
    new_home = CareHome(name="Second Home", address="99 Elm St")
    db_session.add(new_home)
    db_session.commit()
    db_session.refresh(new_home)

    response = client.patch(
        f"/users/{test_user.id}/care-home",
        json={"care_home_id": new_home.id},
        headers=manager_auth_headers,
    )

    assert response.status_code == 200

    db_session.refresh(test_user)
    assert test_user.care_home_id == new_home.id


def test_assign_care_home_as_worker_forbidden(client, worker_auth_headers, test_manager, test_care_home):
    response = client.patch(
        f"/users/{test_manager.id}/care-home",
        json={"care_home_id": test_care_home.id},
        headers=worker_auth_headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Only managers can assign care homes to users"


def test_assign_care_home_nonexistent_user_returns_404(client, manager_auth_headers, test_care_home):
    response = client.patch(
        "/users/-99999/care-home",
        json={"care_home_id": test_care_home.id},
        headers=manager_auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "User with id -99999 not found"


def test_assign_nonexistent_care_home_returns_404(client, manager_auth_headers, test_user):
    response = client.patch(
        f"/users/{test_user.id}/care-home",
        json={"care_home_id": -99999},
        headers=manager_auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Care home with id -99999 not found"


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


def test_change_password_requires_auth(client):
    response = client.patch(
        "/users/me/change-password",
        json={"current_password": "password123", "new_password": "newpassword456"},
    )

    assert response.status_code == 401


def test_forgot_password_existing_user_sends_email(client, test_user, db_session):
    with patch("app.routers.auth.send_password_reset_email") as mock_send:
        response = client.post(
            "/forgot-password",
            json={"email": test_user.email},
        )

    assert response.status_code == 200
    mock_send.assert_called_once()

    reset = db_session.query(PasswordReset).filter(PasswordReset.email == test_user.email).first()
    assert reset is not None
    assert reset.otp_code is not None


def test_forgot_password_nonexistent_email_returns_generic_message(client):
    with patch("app.routers.auth.send_password_reset_email") as mock_send:
        response = client.post(
            "/forgot-password",
            json={"email": "doesnotexist@test.com"},
        )

    assert response.status_code == 200
    assert "If that email is registered" in response.json()["message"]
    mock_send.assert_not_called()


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
        "/login",
        data={"username": test_user.email, "password": "resetpassword789"},
    )
    assert login_response.status_code == 200


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