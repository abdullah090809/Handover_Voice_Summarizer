import logging
import httpx
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.device_token import DeviceToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_push_notifications(
    db: Session,
    user_ids: list[int],
    title: str,
    body: str,
    data: dict | None = None,
) -> int:
    """Finds active device tokens for the given users and sends push notifications via Expo.

    Deactivates any tokens that Expo returns as invalid (DeviceNotRegistered).
    Returns the number of successfully sent notifications.
    """
    if not user_ids:
        return 0

    # Query active tokens for these users
    tokens = (
        db.query(DeviceToken)
        .filter(DeviceToken.user_id.in_(user_ids), DeviceToken.is_active == True)
        .all()
    )

    if not tokens:
        logger.info(f"No active push tokens found for users: {user_ids}")
        return 0

    # Prepare push messages
    messages = []
    token_map = {}  # Map push token string to DeviceToken model instance for quick update
    for token in tokens:
        message = {
            "to": token.push_token,
            "title": title,
            "body": body,
            "sound": "default",
        }
        if data:
            message["data"] = data
        messages.append(message)
        token_map[token.push_token] = token

    # Send in batches of 100 (Expo limit)
    sent_count = 0
    now = datetime.now(timezone.utc)

    for i in range(0, len(messages), 100):
        batch = messages[i : i + 100]
        try:
            logger.info(f"Sending batch of {len(batch)} push notifications to Expo API")
            response = httpx.post(
                EXPO_PUSH_URL,
                json=batch,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                timeout=10.0,
            )
            response.raise_for_status()
            res_data = response.json()
            
            # Process tickets returned by Expo
            tickets = res_data.get("data", [])
            for msg, ticket in zip(batch, tickets):
                token_str = msg["to"]
                token_model = token_map.get(token_str)
                
                if not token_model:
                    continue

                if ticket.get("status") == "ok":
                    sent_count += 1
                    token_model.last_used_at = now
                else:
                    error_msg = ticket.get("message", "Unknown error")
                    details = ticket.get("details", {})
                    error_code = details.get("error")

                    logger.warning(
                        f"Expo push notification failed for token {token_str[:20]}...: "
                        f"status={ticket.get('status')}, error={error_code}, message={error_msg}"
                    )

                    # Expo indicates the token is no longer registered/valid
                    if error_code == "DeviceNotRegistered":
                        logger.info(f"Deactivating invalid device token: {token_str[:20]}...")
                        token_model.is_active = False

            db.commit()

        except httpx.HTTPStatusError as exc:
            logger.error(
                f"Expo Push API returned status error: {exc.response.status_code} - {exc.response.text}"
            )
        except Exception as exc:
            logger.exception("Failed to send push notification batch via Expo")

    return sent_count
