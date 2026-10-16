import io
import pytest
from datetime import datetime

def get_manager_token(client):
    res = client.post("/api/auth/login", json={"pin": "9999", "expected_role": "MANAGER"})
    assert res.status_code == 200
    return res.json()["access_token"]

def get_auditor_token(client):
    res = client.post("/api/auth/login", json={"pin": "0000", "expected_role": "AUDITOR"})
    assert res.status_code == 200
    return res.json()["access_token"]

def test_large_upload_rejected(client):
    """Przesłanie pliku przekraczającego 15MB musi zostać odrzucone kodem 413."""
    aud_token = get_auditor_token(client)
    headers = {"Authorization": f"Bearer {aud_token}"}
    
    # Symulacja pliku 16MB
    large_content = b"0" * (16 * 1024 * 1024)
    files = {
        "photo": ("test_huge.jpg", io.BytesIO(large_content), "image/jpeg")
    }
    data = {
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "notes": "Test upload limit"
    }
    res = client.post("/api/audit", data=data, files=files, headers=headers)
    assert res.status_code in [400, 413]
    assert "15 MB" in res.json().get("detail", "")

def test_patch_status_manager_only(client):
    """Zmiana statusu audytu jest dozwolona wyłącznie dla roli MANAGER."""
    # 1. Tworzenie audytu testowego
    audit_res = client.post("/api/audit", data={
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "ccp1_fe_ok": "ZGODNY",
        "notes": "Test status RBAC"
    })
    assert audit_res.status_code == 200
    audit_id = audit_res.json()["audit_id"]

    aud_token = get_auditor_token(client)
    mgr_token = get_manager_token(client)

    # 2. Próba zmiany przez audytora -> 403 Forbidden
    aud_res = client.patch(
        f"/api/audits/{audit_id}/status",
        json={"status": "ZATWIERDZONY", "reason": "Proba zatwierdzenia przez audytora"},
        headers={"Authorization": f"Bearer {aud_token}"}
    )
    assert aud_res.status_code == 403

    # 3. Zmiana przez Managera -> 200 OK
    mgr_res = client.patch(
        f"/api/audits/{audit_id}/status",
        json={"status": "ZATWIERDZONY", "reason": "Zatwierdzenie przez Managera Jakości"},
        headers={"Authorization": f"Bearer {mgr_token}"}
    )
    assert mgr_res.status_code == 200
    assert mgr_res.json()["status"] == "OK"

def test_delete_audit_manager_only(client):
    """Usunięcie audytu jest dozwolone wyłącznie dla roli MANAGER."""
    audit_res = client.post("/api/audit", data={
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "notes": "Test delete RBAC"
    })
    assert audit_res.status_code == 200
    audit_id = audit_res.json()["audit_id"]

    aud_token = get_auditor_token(client)
    mgr_token = get_manager_token(client)

    # Audytor próbuje usunąć audyt -> 403
    aud_res = client.delete(f"/api/audits/{audit_id}", headers={"Authorization": f"Bearer {aud_token}"})
    assert aud_res.status_code == 403

    # Manager usuwa audyt -> 200
    mgr_res = client.delete(f"/api/audits/{audit_id}", headers={"Authorization": f"Bearer {mgr_token}"})
    assert mgr_res.status_code == 200
    assert mgr_res.json()["status"] == "OK"

def test_schedule_clear_endpoints_manager_only(client):
    """Czyszczenie harmonogramu (/clear-month i /clear-all) wymaga uprawnień Managera."""
    aud_token = get_auditor_token(client)
    mgr_token = get_manager_token(client)

    # 1. Audytor bez uprawnień managera -> 403
    res_m = client.post("/api/schedule/clear-month", json={"month": 1, "year": 2026}, headers={"Authorization": f"Bearer {aud_token}"})
    assert res_m.status_code == 403

    res_a = client.post("/api/schedule/clear-all", headers={"Authorization": f"Bearer {aud_token}"})
    assert res_a.status_code == 403

    # 2. Manager z uprawnieniami -> 200
    res_mgr_m = client.post("/api/schedule/clear-month", json={"month": 1, "year": 2026}, headers={"Authorization": f"Bearer {mgr_token}"})
    assert res_mgr_m.status_code == 200
    assert res_mgr_m.json()["status"] == "success"

def test_schedule_idor_protection(client):
    """Audytor nie może modyfikować zadania innego audytora (ochrona IDOR)."""
    mgr_token = get_manager_token(client)
    aud_token = get_auditor_token(client)

    # Tworzymy zadanie przypisane do kogoś innego (np. Jan Kowalski)
    c_res = client.post("/api/schedule", json={
        "scheduled_date": "2026-11-20",
        "audit_type": "HACCP",
        "line": "Linia L1",
        "lead_auditor": "Jan Kowalski",
        "backup_auditor": "Anna Nowak",
        "notes": "Zadanie Jana"
    }, headers={"Authorization": f"Bearer {mgr_token}"})
    assert c_res.status_code == 200

    # Pobieramy ID
    schedules = client.get("/api/schedule").json()
    jan_sched = next(s for s in schedules if s["lead_auditor"] == "Jan Kowalski")
    sched_id = jan_sched["id"]

    # Audytor Grzegorz próbuje zmienić wpis Jana Kowalskiego -> 403
    put_res = client.put(f"/api/schedule/{sched_id}", json={
        "scheduled_date": "2026-11-21",
        "audit_type": "HACCP",
        "line": "Linia L1",
        "lead_auditor": "Jan Kowalski",
        "backup_auditor": "Anna Nowak",
        "status": "PLANOWANY",
        "notes": "Złośliwa próba edycji"
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert put_res.status_code == 403
    assert "innego audytora" in put_res.json()["detail"]

    # Próba przełożenia terminu (reschedule) -> 403
    resched_res = client.put(f"/api/schedule/{sched_id}/reschedule", json={
        "new_date": "2026-11-25"
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert resched_res.status_code == 403

    # Manager bez problemu może edytować zadanie
    mgr_put_res = client.put(f"/api/schedule/{sched_id}", json={
        "scheduled_date": "2026-11-22",
        "audit_type": "HACCP",
        "line": "Linia L1",
        "lead_auditor": "Jan Kowalski",
        "backup_auditor": "Anna Nowak",
        "status": "PLANOWANY",
        "notes": "Edycja przez managera"
    }, headers={"Authorization": f"Bearer {mgr_token}"})
    assert mgr_put_res.status_code == 200

def test_powerbi_csv_export(client):
    """Eksport PowerBI CSV poprawnie interpretuje statusy ZGODNY i OK."""
    res = client.get("/api/audits/export/powerbi/csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    content = res.text
    assert "ccp_zgodny" in content.lower()
    assert "gmp_zgodny" in content.lower()

def test_total_score_pct_calculated_and_stored(client):
    """Obliczanie wskaźnika total_score_pct i zapis do bazy."""
    res = client.post("/api/audit", data={
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "ccp1_fe_ok": "ZGODNY",
        "notes": "Test total score"
    })
    assert res.status_code == 200
    data = res.json()
    assert "total_score_pct" in data
    assert data["total_score_pct"] == 100.0

def test_request_edit_requires_auth(client):
    """POST /api/audits/request-edit wymaga zalogowania (401 bez tokenu)."""
    # 1. Bez tokenu
    res_no_auth = client.post("/api/audits/request-edit", json={
        "audit_id": 1,
        "requested_by": "Anon",
        "reason": "Test bez tokenu"
    })
    assert res_no_auth.status_code == 401

    # 2. Z tokenem audytora
    aud_token = get_auditor_token(client)
    res_auth = client.post("/api/audits/request-edit", json={
        "audit_id": 1,
        "requested_by": "Audytor",
        "reason": "Test z tokenem audytora"
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert res_auth.status_code in [200, 400]  # 200 lub 400 jeśli wniosek już oczekuje

def test_apply_audit_correction_rbac_and_fullname_keyerror(client):
    """Weryfikacja braku KeyError: full_name oraz blokady edycji pól krytycznych przez audytora."""
    mgr_token = get_manager_token(client)
    aud_token = get_auditor_token(client)

    # 1. Tworzymy audyt
    a_res = client.post("/api/audit", data={
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1",
        "shift": "1",
        "zone": "High Care",
        "notes": "Test correction RBAC"
    })
    audit_id = a_res.json()["audit_id"]

    # 2. Zgłoszenie wniosku i zatwierdzenie przez managera (odblokowanie)
    req_res = client.post("/api/audits/request-edit", json={
        "audit_id": audit_id,
        "requested_by": "Audytor",
        "reason": "Potrzebna zmiana notatek"
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert req_res.status_code == 200

    # Pobieramy ID wniosku
    edit_reqs = client.get("/api/audits/edit-requests", headers={"Authorization": f"Bearer {mgr_token}"}).json()
    req_obj = next(r for r in edit_reqs if r["audit_id"] == audit_id)
    dec_res = client.post("/api/audits/decide-edit", json={
        "request_id": req_obj["id"],
        "decision": "ZATWIERDZONY",
        "manager_comment": "Zgoda"
    }, headers={"Authorization": f"Bearer {mgr_token}"})
    assert dec_res.status_code == 200

    # 3. Audytor próbuje zmienić pola krytyczne (np. compliance_verdict) -> 403
    aud_corr_res = client.put("/api/audits/apply-correction", json={
        "audit_id": audit_id,
        "modified_by": "Audytor",
        "change_reason": "Próba zmiany werdyktu",
        "updated_fields": {"compliance_verdict": "ZGODNY"}
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert aud_corr_res.status_code == 403

    # 4. Audytor zmienia dozwolone pole (np. notes) -> 200 i brak błędu KeyError: full_name
    aud_corr_ok = client.put("/api/audits/apply-correction", json={
        "audit_id": audit_id,
        "modified_by": "Audytor",
        "change_reason": "Poprawka literówki w notatce",
        "updated_fields": {"notes": "Poprawiona notatka"}
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert aud_corr_ok.status_code == 200
    assert aud_corr_ok.json()["status"] == "OK"

def test_notes_endpoints_manager_auth_and_chat_clear(client):
    """Zabezpieczenie endpointów notatek oraz ochrona notatek TO_MANAGER przy chat-clear."""
    mgr_token = get_manager_token(client)
    aud_token = get_auditor_token(client)

    # 1. Tworzymy oficjalną notatkę audytora
    n_res = client.post("/api/auditor-notes", json={
        "auditor_name": "Testowy Audytor",
        "content": "Oficjalna notatka audytowa nie do skasowania przez chat"
    })
    assert n_res.status_code == 200
    note_id = n_res.json()["note_id"]

    # 2. Tworzymy wiadomość na Live Chacie
    c_res = client.post("/api/auditor-notes/chat-send", json={
        "sender_name": "Testowy Audytor",
        "sender_role": "AUDITOR",
        "message": "Wiadomość na czacie"
    })
    assert c_res.status_code == 200

    # 3. Próba reply przez audytora bez uprawnień managera -> 403
    reply_aud = client.post(f"/api/auditor-notes/{note_id}/reply", json={
        "manager_response": "Próba odpowiedzi"
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert reply_aud.status_code == 403

    # 4. Próba mark-all-read przez audytora -> 403
    mark_aud = client.post("/api/auditor-notes/mark-all-read", headers={"Authorization": f"Bearer {aud_token}"})
    assert mark_aud.status_code == 403

    # 5. Próba chat-clear przez audytora -> 403
    clear_aud = client.post("/api/auditor-notes/chat-clear", headers={"Authorization": f"Bearer {aud_token}"})
    assert clear_aud.status_code == 403

    # 6. Manager czyści czat -> 200
    clear_mgr = client.post("/api/auditor-notes/chat-clear", headers={"Authorization": f"Bearer {mgr_token}"})
    assert clear_mgr.status_code == 200

    # 7. Weryfikacja: oficjalna notatka nadal istnieje w skrzynce notatek!
    notes_list = client.get("/api/auditor-notes").json()
    assert any(n["id"] == note_id for n in notes_list)

def test_auditor_forbidden_on_line_delete_and_chat_clear(client):
    """Rola AUDITOR otrzymuje 403 Forbidden przy próbie wywołania DELETE /api/lines/1 oraz POST /api/auditor-notes/chat-clear."""
    aud_token = get_auditor_token(client)
    headers = {"Authorization": f"Bearer {aud_token}"}

    # 1. DELETE /api/lines/1 przez audytora -> 403 Forbidden
    del_line_res = client.delete("/api/lines/1", headers=headers)
    assert del_line_res.status_code == 403

    # 2. POST /api/auditor-notes/chat-clear przez audytora -> 403 Forbidden
    chat_clear_res = client.post("/api/auditor-notes/chat-clear", headers=headers)
    assert chat_clear_res.status_code == 403

def test_magic_bytes_spoofing_rejected(client):
    """Wyślij do POST /api/audit plik exploit.jpg z zawartością bash - musi zwrócić 400 i sygnaturę ISO 27001."""
    aud_token = get_auditor_token(client)
    headers = {"Authorization": f"Bearer {aud_token}"}
    fake_photo = io.BytesIO(b"#!/bin/bash\necho hacked")
    files = {"photo": ("exploit.jpg", fake_photo, "image/jpeg")}
    data = {
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "notes": "Test exploit upload"
    }
    res = client.post("/api/audit", data=data, files=files, headers=headers)
    assert res.status_code == 400
    detail = res.json().get("detail", "")
    assert "sygnatura binarna" in detail.lower() or "iso 27001" in detail.lower()

def test_client_side_ko_tampering_prevented(client):
    """Sfałszowanie flagi is_ko: False w JSON przez klienta jest ignorowane przez backend na podstawie CHECKLIST_TEMPLATES."""
    import json
    checklist = {}
    for q_id in range(101, 111):
        if q_id == 106:
            # W szablonie serwerowym pytanie 106 to KO. Klient celowo fałszuje is_ko na False!
            checklist[str(q_id)] = {
                "clause": "3.2 Częstotliwość (KO)",
                "question": "Częstotliwość zapisów",
                "score": 1,
                "status": "NOK",
                "is_ko": False,
                "accepted": True,
                "locked": True,
                "notes": "Fałszywy audyt z próbą ominięcia KO"
            }
        else:
            checklist[str(q_id)] = {
                "clause": f"Klauzula {q_id}",
                "question": "Pytanie zgodne",
                "score": 5,
                "status": "OK",
                "is_ko": False,
                "accepted": True,
                "locked": True
            }

    payload = {
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "audit_type": "HACCP",
        "health_ok": "TAK",
        "glass_plastic_ok": "ZGODNY",
        "allergen_clean_ok": "ZGODNY",
        "wood_policy_ok": "ZGODNY",
        "ppe_ok": "ZGODNY",
        "line_status": "Produkcja Ciągła",
        "ccp1_fe_ok": "ZGODNY",
        "ccp1_nonfe_ok": "ZGODNY",
        "ccp1_ss_ok": "ZGODNY",
        "ccp1_reject_ok": "ZGODNY",
        "ccp1_bin_locked": "ZGODNY",
        "ccp2_magnet_ok": "ZGODNY",
        "ccp3_sieve_ok": "ZGODNY",
        "gmp_cleanliness_ok": "ZGODNY",
        "gmp_wood_score": 5,
        "gmp_foreign_score": 5,
        "gmp_waste_ok": "ZGODNY",
        "ko_failed": "false",
        "checklist_results": json.dumps(checklist),
        "notes": "Test tamper KO"
    }
    res = client.post("/api/audit", data=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["slm_verdict"] == "NOK"
    assert data["risk_level"] == "KRYTYCZNE (HOLD LOT)"

def test_incomplete_or_unaccepted_checklist_rejected(client):
    """Niepełna checklista (<100% pytań) lub niezatwierdzone pytania (accepted: False) muszą zostać odrzucone z kodem 400."""
    import json
    # Przypadek 1: Tylko 3 pytania zamiast 10 dla HACCP
    partial_checklist = {
        "101": {"score": 5, "accepted": True, "locked": True},
        "102": {"score": 5, "accepted": True, "locked": True},
        "103": {"score": 5, "accepted": True, "locked": True}
    }
    res_partial = client.post("/api/audit", data={
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "audit_type": "HACCP",
        "checklist_results": json.dumps(partial_checklist)
    })
    assert res_partial.status_code == 400
    assert "100%" in res_partial.json().get("detail", "")

    # Przypadek 2: Komplet 10 pytań, ale jedno ma accepted: False i locked: False
    full_checklist = {}
    for q_id in range(101, 111):
        full_checklist[str(q_id)] = {
            "score": 5,
            "accepted": (q_id != 105),
            "locked": False
        }
    res_unaccepted = client.post("/api/audit", data={
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "audit_type": "HACCP",
        "checklist_results": json.dumps(full_checklist)
    })
    assert res_unaccepted.status_code == 400
    assert "100%" in res_unaccepted.json().get("detail", "")

def test_audit_immutability_and_re_lock_after_correction(client):
    """Rekord audytu jest zablokowany, odblokowuje się wyłącznie po decyzji Managera i ponownie automatycznie blokuje po 1 korekcie."""
    aud_token = get_auditor_token(client)
    mgr_token = get_manager_token(client)

    # 1. Tworzymy nowy audyt
    a_res = client.post("/api/audit", data={
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "notes": "Oryginalna notatka"
    })
    assert a_res.status_code == 200
    audit_id = a_res.json()["audit_id"]

    # 2. Próba bezpośredniej korekty bez zatwierdzonego wniosku -> 403 Forbidden
    corr_fail = client.put("/api/audits/apply-correction", json={
        "audit_id": audit_id,
        "modified_by": "Audytor",
        "change_reason": "Próba nieautoryzowanej zmiany",
        "updated_fields": {"notes": "Nieautoryzowana zmiana"}
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert corr_fail.status_code == 403

    # 3. Złożenie wniosku o edycję przez audytora
    req_res = client.post("/api/audits/request-edit", json={
        "audit_id": audit_id,
        "reason": "Korekta literówki w notatce audytowej"
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert req_res.status_code == 200
    request_id = req_res.json()["request_id"]

    # 4. Manager zatwierdza wniosek
    dec_res = client.post("/api/audits/decide-edit", json={
        "request_id": request_id,
        "decision": "ZATWIERDZONY",
        "manager_comment": "Zezwolono na korektę"
    }, headers={"Authorization": f"Bearer {mgr_token}"})
    assert dec_res.status_code == 200

    # 5. Audytor aplikuje 1 korektę -> 200 OK
    corr_ok = client.put("/api/audits/apply-correction", json={
        "audit_id": audit_id,
        "modified_by": "Audytor",
        "change_reason": "Oficjalna poprawka",
        "updated_fields": {"notes": "Poprawiona notatka po zgodzie managera"}
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert corr_ok.status_code == 200

    # 6. Audytor próbuje wykonać drugą korektę na tym samym audycie -> 403 (rekord automatycznie zablokował się po 1 edycji!)
    corr_relock = client.put("/api/audits/apply-correction", json={
        "audit_id": audit_id,
        "modified_by": "Audytor",
        "change_reason": "Druga próba zmiany bez nowego wniosku",
        "updated_fields": {"notes": "Próba ponownej edycji"}
    }, headers={"Authorization": f"Bearer {aud_token}"})
    assert corr_relock.status_code == 403

def test_brute_force_rate_limiting_iso27001(client):
    """Wielokrotne błędne próby logowania (5 nieudanych) muszą aktywować blokadę 429 Too Many Requests (ISO 27001)."""
    from security import _login_failures
    _login_failures.clear()

    # 5 błędnych prób logowania (nieprawidłowy PIN)
    for _ in range(5):
        res = client.post("/api/auth/login", json={"pin": "WRONG_PIN", "expected_role": "AUDITOR"})
        assert res.status_code == 401

    # 6. próba musi zostać zablokowana kodem 429 Too Many Requests
    blocked_res = client.post("/api/auth/login", json={"pin": "WRONG_PIN", "expected_role": "AUDITOR"})
    assert blocked_res.status_code == 429
    assert "zbyt wiele nieudanych prób" in blocked_res.json().get("detail", "").lower()

    # Czyszczenie po teście
    _login_failures.clear()

