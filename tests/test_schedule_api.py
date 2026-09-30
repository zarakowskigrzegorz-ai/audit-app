import pytest

def test_get_schedule(client):
    """Pobranie harmonogramu zwraca listę zaplanowanych audytów."""
    res = client.get("/api/schedule")
    assert res.status_code == 200
    items = res.json()
    assert isinstance(items, list)

def test_create_schedule_requires_auth(client):
    """Próba utworzenia wpisu bez tokenu Bearer zostaje odrzucona statusem 401."""
    payload = {
        "scheduled_date": "2026-10-15",
        "line": "Linia L1 (Masa Konszowanie)",
        "audit_type": "HACCP",
        "lead_auditor": "Grzegorz Zarakowski",
        "backup_auditor": "Administrator Jakości",
        "notes": "Test bez tokenu"
    }
    res = client.post("/api/schedule", json=payload)
    assert res.status_code == 401

def test_create_schedule_entry_with_auth(client):
    """Dodanie nowego zlecenia audytu do kalendarza z poprawnym tokenem."""
    login_res = client.post("/api/auth/login", json={"pin": "9999", "expected_role": "MANAGER"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    payload = {
        "scheduled_date": "2026-10-15",
        "line": "Linia L1 (Masa Konszowanie)",
        "audit_type": "HACCP",
        "lead_auditor": "Grzegorz Zarakowski",
        "backup_auditor": "Administrator Jakości",
        "notes": "Testowy audyt okresowy IFS z tokenem"
    }
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post("/api/schedule", json=payload, headers=headers)
    assert res.status_code in [200, 201]
    assert res.json().get("status") == "success"
