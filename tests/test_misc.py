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


def test_websocket_handovers_connects_and_stays_open(client):
    with client.websocket_connect("/ws/handovers") as websocket:
        # Server doesn't push anything unprompted; just confirm the
        # handshake succeeds and the socket can be closed cleanly.
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
