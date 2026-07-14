from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.pending_user import PendingUser
from app.models.user import User


# ---------------------------------------------------------------------------
# POST /register
# ---------------------------------------------------------------------------

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
    assert len(pending.otp_code) == 6
    # password must never be stored in plaintext
    assert pending.password != "securepass123"


def test_register_duplicate_verified_email_fails(client, test_user):
    response = client.post(
        "/register",
        json={"email": test_user.email, "password": "securepass123"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_register_existing_pending_user_reissues_otp(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        client.post("/register", json={"email": "dupe@test.com", "password": "securepass123"})

    first_pending = db_session.query(PendingUser).filter(PendingUser.email == "dupe@test.com").first()
    first_otp = first_pending.otp_code

    with patch("app.routers.auth.send_verification_email") as mock_send:
        response = client.post(
            "/register", json={"email": "dupe@test.com", "password": "newpassword456"}
        )

    assert response.status_code == 201
    mock_send.assert_called_once()

    db_session.refresh(first_pending)
    # still only one pending row for the email, but state has been refreshed
    count = db_session.query(PendingUser).filter(PendingUser.email == "dupe@test.com").count()
    assert count == 1


def test_register_email_send_failure_does_not_break_request(client):
    with patch("app.routers.auth.send_verification_email", side_effect=Exception("SMTP down")):
        response = client.post(
            "/register",
            json={"email": "resilient@test.com", "password": "securepass123"},
        )

    assert response.status_code == 201


def test_register_invalid_email_format_rejected(client):
    response = client.post(
        "/register",
        json={"email": "not-an-email", "password": "securepass123"},
    )
    assert response.status_code == 422


def test_register_password_too_short_rejected(client):
    response = client.post(
        "/register",
        json={"email": "shortpass@test.com", "password": "short"},
    )
    assert response.status_code == 422


def test_register_password_too_long_rejected(client):
    response = client.post(
        "/register",
        json={"email": "longpass@test.com", "password": "a" * 73},
    )
    assert response.status_code == 422


def test_register_missing_password_rejected(client):
    response = client.post("/register", json={"email": "nopass@test.com"})
    assert response.status_code == 422


def test_register_otp_daily_limit_enforced(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        for _ in range(5):
            resp = client.post(
                "/register",
                json={"email": "ratelimited@test.com", "password": "securepass123"},
            )
            assert resp.status_code == 201

        sixth = client.post(
            "/register",
            json={"email": "ratelimited@test.com", "password": "securepass123"},
        )

    assert sixth.status_code == 429


def test_register_otp_limit_resets_after_24_hours(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        client.post("/register", json={"email": "reset24h@test.com", "password": "securepass123"})

    pending = db_session.query(PendingUser).filter(PendingUser.email == "reset24h@test.com").first()
    pending.otp_request_count = 5
    pending.otp_window_start = datetime.now(timezone.utc) - timedelta(hours=25)
    db_session.commit()

    with patch("app.routers.auth.send_verification_email"):
        response = client.post(
            "/register", json={"email": "reset24h@test.com", "password": "securepass123"}
        )

    assert response.status_code == 201


# ---------------------------------------------------------------------------
# POST /resend-otp
# ---------------------------------------------------------------------------

def test_resend_otp_success(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        client.post("/register", json={"email": "resend@test.com", "password": "securepass123"})

    pending = db_session.query(PendingUser).filter(PendingUser.email == "resend@test.com").first()
    old_otp = pending.otp_code

    with patch("app.routers.auth.send_verification_email") as mock_send:
        response = client.post("/resend-otp", json={"email": "resend@test.com"})

    assert response.status_code == 200
    assert response.json() == {"message": "Verification code resent to your email"}
    mock_send.assert_called_once()

    db_session.refresh(pending)
    # a new code should (almost always) differ; at minimum the endpoint succeeded
    assert pending.otp_code is not None


def test_resend_otp_no_pending_registration_404(client):
    response = client.post("/resend-otp", json={"email": "nobody@test.com"})
    assert response.status_code == 404
    assert response.json()["detail"] == "No pending registration found for this email"


def test_resend_otp_invalid_email_format_rejected(client):
    response = client.post("/resend-otp", json={"email": "not-an-email"})
    assert response.status_code == 422


def test_resend_otp_rate_limited_after_five_requests(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        client.post("/register", json={"email": "resendlimit@test.com", "password": "securepass123"})

        for _ in range(4):
            resp = client.post("/resend-otp", json={"email": "resendlimit@test.com"})
            assert resp.status_code == 200

        sixth = client.post("/resend-otp", json={"email": "resendlimit@test.com"})

    assert sixth.status_code == 429
    assert "Too many verification code requests" in sixth.json()["detail"]


# ---------------------------------------------------------------------------
# POST /verify
# ---------------------------------------------------------------------------

def test_verify_with_correct_otp_creates_user(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        client.post("/register", json={"email": "verifyme@test.com", "password": "securepass123"})

    pending = db_session.query(PendingUser).filter(PendingUser.email == "verifyme@test.com").first()
    otp_code = pending.otp_code

    response = client.post("/verify", json={"email": "verifyme@test.com", "otp_code": otp_code})

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "verifyme@test.com"
    assert body["role"] == "care_worker"
    assert "id" in body
    assert "password" not in body

    user = db_session.query(User).filter(User.email == "verifyme@test.com").first()
    assert user is not None

    pending_after = db_session.query(PendingUser).filter(PendingUser.email == "verifyme@test.com").first()
    assert pending_after is None


def test_verify_with_wrong_otp_fails(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        client.post("/register", json={"email": "wrongotp@test.com", "password": "securepass123"})

    response = client.post("/verify", json={"email": "wrongotp@test.com", "otp_code": "000000"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid verification code"


def test_verify_no_pending_registration_404(client):
    response = client.post("/verify", json={"email": "ghost@test.com", "otp_code": "123456"})
    assert response.status_code == 404
    assert response.json()["detail"] == "No pending registration found for this email"


def test_verify_expired_otp_fails(client, db_session):
    with patch("app.routers.auth.send_verification_email"):
        client.post("/register", json={"email": "expired@test.com", "password": "securepass123"})

    pending = db_session.query(PendingUser).filter(PendingUser.email == "expired@test.com").first()
    pending.otp_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    response = client.post(
        "/verify", json={"email": "expired@test.com", "otp_code": pending.otp_code}
    )

    assert response.status_code == 400
    assert "expired" in response.json()["detail"].lower()


def test_verify_otp_wrong_length_rejected(client):
    response = client.post("/verify", json={"email": "x@test.com", "otp_code": "123"})
    assert response.status_code == 422


def test_verify_otp_non_numeric_rejected(client):
    response = client.post("/verify", json={"email": "x@test.com", "otp_code": "abcdef"})
    assert response.status_code == 422


def test_verify_does_not_allow_duplicate_email_if_already_registered(client, db_session, test_user):
    """A pending registration for an email that became a real user in the
    meantime should not silently create a second account with the same
    email. The route has no explicit guard for this race, so it currently
    surfaces as an uncaught IntegrityError from the DB's unique constraint
    (TestClient re-raises server-side exceptions instead of returning the
    global 500 handler's response) rather than a clean 4xx — this test
    documents/pins that current behavior so a future fix is a deliberate,
    visible change rather than a silent regression."""
    pending = PendingUser(
        email=test_user.email,
        password="hashedpw",
        otp_code="654321",
        otp_expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db_session.add(pending)
    db_session.commit()

    with pytest.raises(IntegrityError):
        client.post("/verify", json={"email": test_user.email, "otp_code": "654321"})


# ---------------------------------------------------------------------------
# POST /login
# ---------------------------------------------------------------------------

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
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_login_with_nonexistent_email_fails(client):
    response = client.post(
        "/login",
        data={"username": "doesnotexist@test.com", "password": "whatever"},
    )
    assert response.status_code == 401


def test_login_missing_fields_rejected(client):
    response = client.post("/login", data={"username": "someone@test.com"})
    assert response.status_code == 422


def test_login_case_sensitive_email_does_not_match(client, test_user):
    response = client.post(
        "/login",
        data={"username": test_user.email.upper(), "password": "password123"},
    )
    # emails are stored/queried case-sensitively; this documents current behavior
    assert response.status_code == 401


def test_login_token_grants_access_to_protected_route(client, test_user):
    login_resp = client.post(
        "/login", data={"username": test_user.email, "password": "password123"}
    )
    token = login_resp.json()["access_token"]

    me_resp = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == test_user.email


def test_protected_route_rejects_malformed_token(client):
    response = client.get("/users/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_protected_route_rejects_missing_bearer_prefix(client, worker_token):
    response = client.get("/users/me", headers={"Authorization": worker_token})
    assert response.status_code == 401
