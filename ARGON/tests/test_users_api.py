import pytest

def get_manager_token(client):
    res = client.post("/api/auth/login", json={"pin": "9999", "expected_role": "MANAGER"})
    assert res.status_code == 200
    return res.json()["access_token"]

def get_auditor_token(client):
    res = client.post("/api/auth/login", json={"pin": "0000", "expected_role": "AUDITOR"})
    assert res.status_code == 200
    return res.json()["access_token"]

def test_delete_auditor_workflow(client):
    """Test pełnego cyklu życia audytora: dodanie, listowanie, usunięcie i weryfikacja."""
    mgr_token = get_manager_token(client)
    headers = {"Authorization": f"Bearer {mgr_token}"}

    # 1. Dodanie nowego audytora
    add_res = client.post("/api/users", json={
        "pin": "7777",
        "full_name": "Testowy Audytor Usuwanie",
        "role": "AUDITOR",
        "qualifications": ["HACCP", "GMP"]
    }, headers=headers)
    assert add_res.status_code == 200
    created_id = add_res.json().get("id")
    assert created_id is not None

    # 2. Sprawdzenie czy audytor jest na liście aktywnych
    list_res = client.get("/api/users", headers=headers)
    assert list_res.status_code == 200
    users = list_res.json()
    assert any(u["id"] == created_id for u in users)

    # 3. Usunięcie audytora (dezaktywacja)
    del_res = client.delete(f"/api/users/{created_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "OK"

    # 4. Sprawdzenie czy audytor zniknął z listy aktywnych
    list_after = client.get("/api/users", headers=headers)
    assert list_after.status_code == 200
    users_after = list_after.json()
    assert not any(u["id"] == created_id for u in users_after)

def test_cannot_delete_quality_manager(client):
    """Główne konto Managera Jakości (ID=1) nie może zostać usunięte."""
    mgr_token = get_manager_token(client)
    headers = {"Authorization": f"Bearer {mgr_token}"}

    del_res = client.delete("/api/users/1", headers=headers)
    assert del_res.status_code == 400
    assert "Nie można usunąć głównego konta" in del_res.json()["detail"]

def test_auditor_cannot_delete_users(client):
    """Zwykły audytor nie ma uprawnień do usuwania użytkowników (403 Forbidden)."""
    aud_token = get_auditor_token(client)
    headers = {"Authorization": f"Bearer {aud_token}"}

    del_res = client.delete("/api/users/143", headers=headers)
    assert del_res.status_code == 403
