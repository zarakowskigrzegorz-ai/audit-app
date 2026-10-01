import pytest

def test_checklist_template_endpoint(client):
    """Weryfikuje czy szablony checklist (HACCP, GMP, GHP) zwracają poprawne pytania z flagami KO."""
    for standard in ["HACCP", "GMP", "GHP"]:
        for ep in [f"/api/checklist-template/{standard}", f"/api/checklists/template/{standard}"]:
            res = client.get(ep)
            assert res.status_code == 200
            items = res.json()
            assert isinstance(items, list)
            assert len(items) >= 9
            # Sprawdź czy istnieją pytania Knock-Out (is_ko == True)
            ko_items = [i for i in items if i.get("is_ko") is True]
            assert len(ko_items) >= 1
            for item in items:
                assert "id" in item
                assert "clause" in item
                assert "question" in item

def test_audit_creation_success_conform(client):
    """Rejestracja w 100% zgodnego audytu z poprawnymi parametrami CCP i brakiem odchyleń KO."""
    payload = {
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L1 (Masa Konszowanie)",
        "shift": "1",
        "zone": "High Care",
        "health_ok": "TAK",
        "dispense_no": "TEST-001",
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
        "ko_failed": False,
        "notes": "Test zgodności IFS Food v8"
    }
    res = client.post("/api/audit", data=payload)
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "OK"
    assert "audit_id" in data

def test_audit_ko_failure_triggers_hold_lot(client):
    """Wykrycie usterki na detektorze metali (ccp1_reject_ok=NIEZGODNY) musi wymusić werdykt NOK."""
    payload = {
        "auditor_id": "Grzegorz Zarakowski",
        "line": "Linia L2 (Pakowanie Czekolady)",
        "shift": "1",
        "zone": "High Care",
        "health_ok": "TAK",
        "dispense_no": "TEST-KO-002",
        "glass_plastic_ok": "ZGODNY",
        "allergen_clean_ok": "ZGODNY",
        "wood_policy_ok": "ZGODNY",
        "ppe_ok": "ZGODNY",
        "line_status": "Produkcja Ciągła",
        "ccp1_fe_ok": "ZGODNY",
        "ccp1_nonfe_ok": "ZGODNY",
        "ccp1_ss_ok": "ZGODNY",
        "ccp1_reject_ok": "NIEZGODNY",  # Awaria odrzutnika CCP1
        "ccp1_bin_locked": "ZGODNY",
        "ccp2_magnet_ok": "ZGODNY",
        "ccp3_sieve_ok": "ZGODNY",
        "gmp_cleanliness_ok": "ZGODNY",
        "gmp_wood_score": 5,
        "gmp_foreign_score": 5,
        "gmp_waste_ok": "ZGODNY",
        "ko_failed": True,
        "notes": "Test awarii pętli odrzutu CCP1"
    }
    res = client.post("/api/audit", data=payload)
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "OK"
    verdict = data.get("slm_verdict", "")
    assert "NOK" in verdict or "HOLD" in verdict or data.get("compliance_verdict") == "NIEZGODNY"
