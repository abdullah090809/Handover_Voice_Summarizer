def test_create_resident_success(client, worker_auth_headers, test_care_home):
    response = client.post(
        "/residents/",
        json={"name": "John Smith", "care_home_id": test_care_home.id},
        headers=worker_auth_headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "John Smith"
    assert body["care_home_id"] == test_care_home.id


def test_create_resident_requires_auth(client, test_care_home):
    response = client.post(
        "/residents/",
        json={"name": "John Smith", "care_home_id": test_care_home.id},
    )

    assert response.status_code == 401


def test_create_resident_invalid_care_home_fails(client, worker_auth_headers):
    response = client.post(
        "/residents/",
        json={"name": "Orphan Resident", "care_home_id": -99999},
        headers=worker_auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Care home with id -99999 not found"


def test_list_residents_success(client, worker_auth_headers, test_resident):
    response = client.get("/residents/", headers=worker_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert any(r["id"] == test_resident.id for r in body)


def test_get_resident_by_id_success(client, worker_auth_headers, test_resident):
    response = client.get(f"/residents/{test_resident.id}", headers=worker_auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == test_resident.id


def test_get_nonexistent_resident_returns_404(client, worker_auth_headers):
    response = client.get("/residents/99999", headers=worker_auth_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Resident with id 99999 not found"


def test_update_resident_success(client, worker_auth_headers, test_resident, test_care_home):
    response = client.put(
        f"/residents/{test_resident.id}",
        json={"name": "Jane Updated", "care_home_id": test_care_home.id},
        headers=worker_auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Jane Updated"


def test_update_nonexistent_resident_returns_404(client, worker_auth_headers, test_care_home):
    response = client.put(
        "/residents/99999",
        json={"name": "Ghost", "care_home_id": test_care_home.id},
        headers=worker_auth_headers,
    )

    assert response.status_code == 404


def test_delete_resident_success(client, worker_auth_headers, test_resident):
    resident_id = test_resident.id

    response = client.delete(f"/residents/{resident_id}", headers=worker_auth_headers)

    assert response.status_code == 204

    check = client.get(f"/residents/{resident_id}", headers=worker_auth_headers)
    assert check.status_code == 404


def test_delete_nonexistent_resident_returns_404(client, worker_auth_headers):
    response = client.delete("/residents/-99999", headers=worker_auth_headers)

    assert response.status_code == 404