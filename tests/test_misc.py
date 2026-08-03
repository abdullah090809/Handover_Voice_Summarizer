import pytest


def test_root_status_check(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Handover Voice Summarizer Project is running successfully!"}


def test_unknown_route_returns_404(client):
    response = client.get("/this-route-does-not-exist")
    assert response.status_code == 404


def test_validation_error_uses_custom_envelope(client):
    # Missing required "email"/"password" body on /register triggers a
    # RequestValidationError, which the app wraps in a custom envelope.
    response = client.post("/register", json={})
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["error"] == "Validation Error"
    assert "details" in body


def test_http_exception_uses_custom_envelope(client, worker_auth_headers):
    response = client.get("/residents/99999", headers=worker_auth_headers)
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["detail"] == "Resident with id 99999 not found"


def test_websocket_handovers_unauthenticated_rejected(client):
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/handovers") as websocket:
            websocket.send_text('{"type": "auth", "token": ""}')
            websocket.receive_text()
    assert exc_info.value.code == 4001


def test_websocket_handovers_authenticated(client, worker_token):
    import json
    with client.websocket_connect("/ws/handovers") as websocket:
        websocket.send_text(json.dumps({"type": "auth", "token": worker_token}))
        # connection stays open
        websocket.close()



def test_cors_preflight_allows_any_origin(client):
    response = client.options(
        "/residents/",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code in (200, 204)
    assert response.headers.get("access-control-allow-origin") == "*"