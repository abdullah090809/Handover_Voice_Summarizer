from unittest.mock import patch

from app.models.pending_user import PendingUser
from app.models.user import User


def test_register_creates_pending_user(client, db_session):
    with patch("app.routers.auth.send_verification_email") as mock_send:
        response = client.post(
            "/register",
            json={"email": "newuser@test.com", "password": "securepass123"},
        )

    assert response.status_code == 201
    assert response.json() == {"message": "Verification code sent to your email"}
    mock_send.assert_called_once()

    pending = db_session.query(PendingUser).filter(PendingUser.email == "newuser@test.com").first()
    assert pending is not None
    assert pending.otp_code is not None


def test_register_duplicate_email_fails(client, test_user):
    response = client.post(
        "/register",
        json={"email": test_user.email, "password": "securepass123"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_verify_with_correct_otp_creates_user(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        client.post(
            "/register",
            json={"email": "verifyme@test.com", "password": "securepass123"},
        )

    pending = db_session.query(PendingUser).filter(PendingUser.email == "verifyme@test.com").first()
    otp_code = pending.otp_code

    response = client.post(
        "/verify",
        json={"email": "verifyme@test.com", "otp_code": otp_code},
    )

    assert response.status_code == 200
    assert response.json()["email"] == "verifyme@test.com"

    user = db_session.query(User).filter(User.email == "verifyme@test.com").first()
    assert user is not None

    pending_after = db_session.query(PendingUser).filter(PendingUser.email == "verifyme@test.com").first()
    assert pending_after is None


def test_verify_with_wrong_otp_fails(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        client.post(
            "/register",
            json={"email": "wrongotp@test.com", "password": "securepass123"},
        )

    response = client.post(
        "/verify",
        json={"email": "wrongotp@test.com", "otp_code": "000000"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid verification code"


def test_login_with_correct_credentials_succeeds(client, test_user):
    response = client.post(
        "/login",
        data={"username": test_user.email, "password": "password123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_with_wrong_password_fails(client, test_user):
    response = client.post(
        "/login",
        data={"username": test_user.email, "password": "wrongpassword"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid credentials"


def test_login_with_nonexistent_email_fails(client):
    response = client.post(
        "/login",
        data={"username": "doesnotexist@test.com", "password": "whatever"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid credentials"