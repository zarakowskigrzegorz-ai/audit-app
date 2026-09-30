import pytest

def test_auth_login_with_valid_pin(client):
    """Poprawne uwierzytelnienie kodem PIN zwraca token i dane profilu."""
    res = client.post("/api/auth/login", json={"pin": "0000", "expected_role": "AUDITOR"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["role"] == "AUDITOR"
    assert "qualifications" in data

def test_auth_login_invalid_pin_rejected(client):
    """Nieprawidłowy kod PIN zostaje odrzucony statusem 401."""
    res = client.post("/api/auth/login", json={"pin": "987654", "expected_role": "AUDITOR"})
    assert res.status_code == 401
    assert "detail" in res.json()

def test_manager_role_access_control(client):
    """Zwykły audytor nie ma dostępu do operacji administracyjnych."""
    res = client.delete("/api/auth/users/999?role=AUDITOR")
    assert res.status_code in [401, 403]
