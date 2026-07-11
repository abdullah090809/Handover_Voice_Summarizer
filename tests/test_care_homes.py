def test_create_care_home_success(client, manager_auth_headers):
    response = client.post(
        "/care-homes/",
        json={"name": "Sunrise Manor", "address": "45 Oak Ave"},
        headers=manager_auth_headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Sunrise Manor"
    assert body["address"] == "45 Oak Ave"
    assert "id" in body


def test_create_care_home_as_worker_forbidden(client, worker_auth_headers):
    response = client.post(
        "/care-homes/",
        json={"name": "Sunrise Manor", "address": "45 Oak Ave"},
        headers=worker_auth_headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Manager role required"


def test_create_care_home_requires_auth(client):
    response = client.post(
        "/care-homes/",
        json={"name": "Sunrise Manor", "address": "45 Oak Ave"},
    )

    assert response.status_code == 401


def test_list_care_homes_as_manager_succeeds(client, manager_auth_headers, test_care_home):
    response = client.get("/care-homes/", headers=manager_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert any(ch["id"] == test_care_home.id for ch in body)


def test_list_care_homes_as_worker_forbidden(client, worker_auth_headers, test_care_home):
    response = client.get("/care-homes/", headers=worker_auth_headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "Only managers can view all care homes"


def test_get_care_home_by_id_success(client, worker_auth_headers, test_care_home):
    response = client.get(f"/care-homes/{test_care_home.id}", headers=worker_auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == test_care_home.id


def test_get_nonexistent_care_home_returns_404(client, worker_auth_headers):
    response = client.get("/care-homes/-99999", headers=worker_auth_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Care home with id -99999 not found"


def test_update_care_home_success(client, manager_auth_headers, test_care_home):
    response = client.put(
        f"/care-homes/{test_care_home.id}",
        json={"name": "Renamed Manor", "address": "99 New Rd"},
        headers=manager_auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed Manor"
    assert body["address"] == "99 New Rd"


def test_update_nonexistent_care_home_returns_404(client, manager_auth_headers):
    response = client.put(
        "/care-homes/99999",
        json={"name": "Ghost Home", "address": "Nowhere"},
        headers=manager_auth_headers,
    )

    assert response.status_code == 404


def test_delete_care_home_success(client, manager_auth_headers, test_care_home):
    care_home_id = test_care_home.id

    response = client.delete(f"/care-homes/{care_home_id}", headers=manager_auth_headers)

    assert response.status_code == 204

    check = client.get(f"/care-homes/{care_home_id}", headers=manager_auth_headers)
    assert check.status_code == 404


def test_delete_nonexistent_care_home_returns_404(client, manager_auth_headers):
    response = client.delete("/care-homes/99999", headers=manager_auth_headers)

    assert response.status_code == 404