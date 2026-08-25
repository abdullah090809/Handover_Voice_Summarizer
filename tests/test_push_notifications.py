import pytest
from unittest.mock import patch, MagicMock
import httpx
from app.models.device_token import DeviceToken
from app.models.notification import Notification
from app.models.handover_note import HandoverNote
from app.models.resident import Resident
from app.models.shift import Shift
from app.models.user import User
from app.services.push_notification import send_push_notifications, EXPO_PUSH_URL
from app.tasks import send_push_notification_task


# ---------------------------------------------------------------------------
# POST /notifications/push/register-device
# ---------------------------------------------------------------------------

def test_register_device_unauthenticated(client):
    response = client.post(
        "/notifications/push/register-device",
        json={"push_token": "ExponentPushToken[123]"},
    )
    assert response.status_code == 401


def test_register_device_success(client, worker_auth_headers, test_user, db_session):
    payload = {
        "push_token": "ExponentPushToken[abc123work]",
        "platform": "android",
        "device_id": "phone-1",
    }
    response = client.post(
        "/notifications/push/register-device",
        json=payload,
        headers=worker_auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["push_token"] == payload["push_token"]
    assert data["platform"] == payload["platform"]
    assert data["device_id"] == payload["device_id"]
    assert data["is_active"] is True
    assert data["user_id"] == test_user.id

    # Verify db state
    db_token = db_session.query(DeviceToken).filter(DeviceToken.user_id == test_user.id).first()
    assert db_token is not None
    assert db_token.push_token == payload["push_token"]


def test_register_device_existing_token_same_user(client, worker_auth_headers, test_user, db_session):
    # Setup: pre-create token
    token = DeviceToken(
        user_id=test_user.id,
        push_token="ExponentPushToken[same-user]",
        platform="ios",
        is_active=False,
    )
    db_session.add(token)
    db_session.commit()

    # Call register-device with updated platform
    payload = {
        "push_token": "ExponentPushToken[same-user]",
        "platform": "android",
        "device_id": "new-device-id",
    }
    response = client.post(
        "/notifications/push/register-device",
        json=payload,
        headers=worker_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["platform"] == "android"
    assert response.json()["is_active"] is True
    assert response.json()["device_id"] == "new-device-id"

    # Check database
    db_session.refresh(token)
    assert token.platform == "android"
    assert token.is_active is True


def test_register_device_reassign_token_other_user(client, worker_auth_headers, test_user, test_manager, db_session):
    # Setup: token belongs to manager first
    token = DeviceToken(
        user_id=test_manager.id,
        push_token="ExponentPushToken[shared-device]",
        platform="android",
        is_active=True,
    )
    db_session.add(token)
    db_session.commit()

    # Worker registers the same token
    payload = {
        "push_token": "ExponentPushToken[shared-device]",
        "platform": "android",
    }
    response = client.post(
        "/notifications/push/register-device",
        json=payload,
        headers=worker_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["user_id"] == test_user.id

    # Check database: ownership is updated to worker and manager no longer owns it
    db_session.refresh(token)
    assert token.user_id == test_user.id
    
    manager_tokens_count = db_session.query(DeviceToken).filter(DeviceToken.user_id == test_manager.id).count()
    assert manager_tokens_count == 0


# ---------------------------------------------------------------------------
# POST /notifications/push/unregister-device
# ---------------------------------------------------------------------------

def test_unregister_device_unauthenticated(client):
    response = client.post(
        "/notifications/push/unregister-device",
        json={"push_token": "ExponentPushToken[123]"},
    )
    assert response.status_code == 401


def test_unregister_device_success(client, worker_auth_headers, test_user, db_session):
    token = DeviceToken(
        user_id=test_user.id,
        push_token="ExponentPushToken[unregister-me]",
        is_active=True,
    )
    db_session.add(token)
    db_session.commit()

    response = client.post(
        "/notifications/push/unregister-device",
        json={"push_token": "ExponentPushToken[unregister-me]"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Device token unregistered successfully"

    # Verify db status
    db_session.refresh(token)
    assert token.is_active is False


def test_unregister_device_not_found(client, worker_auth_headers):
    response = client.post(
        "/notifications/push/unregister-device",
        json={"push_token": "ExponentPushToken[non-existent]"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Push token not found for current user"


def test_unregister_device_owned_by_other_user(client, worker_auth_headers, test_manager, db_session):
    token = DeviceToken(
        user_id=test_manager.id,
        push_token="ExponentPushToken[manager-only]",
        is_active=True,
    )
    db_session.add(token)
    db_session.commit()

    response = client.post(
        "/notifications/push/unregister-device",
        json={"push_token": "ExponentPushToken[manager-only]"},
        headers=worker_auth_headers,
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Service / Task and Expo mock tests
# ---------------------------------------------------------------------------

@patch("app.services.push_notification.httpx.post")
def test_send_push_notifications_success_ticket(mock_post, db_session, test_user):
    token = DeviceToken(
        user_id=test_user.id,
        push_token="ExponentPushToken[valid]",
        is_active=True,
    )
    db_session.add(token)
    db_session.commit()

    # Mock Expo API returning status ok
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "data": [{"status": "ok", "id": "receipt-id-123"}]
    }
    mock_post.return_value = mock_response

    sent = send_push_notifications(
        db_session,
        user_ids=[test_user.id],
        title="Test Title",
        body="Test Body",
        data={"key": "val"},
    )
    assert sent == 1
    
    db_session.refresh(token)
    assert token.is_active is True
    assert token.last_used_at is not None

    # Verify mock call arguments
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == EXPO_PUSH_URL
    assert kwargs["json"] == [
        {
            "to": "ExponentPushToken[valid]",
            "title": "Test Title",
            "body": "Test Body",
            "sound": "default",
            "data": {"key": "val"},
        }
    ]


@patch("app.services.push_notification.httpx.post")
def test_send_push_notifications_deactivates_invalid_token(mock_post, db_session, test_user):
    token = DeviceToken(
        user_id=test_user.id,
        push_token="ExponentPushToken[expired]",
        is_active=True,
    )
    db_session.add(token)
    db_session.commit()

    # Mock Expo API returning DeviceNotRegistered
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "data": [
            {
                "status": "error",
                "message": '"ExponentPushToken[expired]" is not a registered push notification recipient',
                "details": {"error": "DeviceNotRegistered"},
            }
        ]
    }
    mock_post.return_value = mock_response

    sent = send_push_notifications(
        db_session,
        user_ids=[test_user.id],
        title="Test",
        body="Test",
    )
    assert sent == 0

    # Token should be deactivated in database
    db_session.refresh(token)
    assert token.is_active is False


@patch("app.services.push_notification.httpx.post")
def test_send_push_notifications_handles_http_errors_gracefully(mock_post, db_session, test_user):
    token = DeviceToken(
        user_id=test_user.id,
        push_token="ExponentPushToken[any]",
        is_active=True,
    )
    db_session.add(token)
    db_session.commit()

    # Mock HTTP Error
    mock_post.side_effect = httpx.HTTPError("Network down")

    # Should not raise exception
    sent = send_push_notifications(
        db_session,
        user_ids=[test_user.id],
        title="Test",
        body="Test",
    )
    assert sent == 0


@patch("app.tasks.send_push_notifications")
def test_celery_task_wraps_service_correctly(mock_send_push, db_session, test_user):
    send_push_notification_task(
        user_ids=[test_user.id],
        title="Task Title",
        body="Task Body",
        data={"some": "data"},
    )
    mock_send_push.assert_called_once()
    # First argument is db session (any SessionLocal instance), followed by others
    args, kwargs = mock_send_push.call_args
    assert args[1] == [test_user.id]
    assert args[2] == "Task Title"
    assert args[3] == "Task Body"
    assert args[4] == {"some": "data"}
