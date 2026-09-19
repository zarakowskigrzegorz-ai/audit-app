import os
import json
import uuid
import shutil
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Request, Form, UploadFile, File, Depends, status, BackgroundTasks
from pydantic import BaseModel

from database import get_db
from agent import analyze_audit_risk, run_agent_turn
from security import (
    get_current_user,
    require_manager,
    require_auditor_or_manager,
    log_security_event
)

router = APIRouter(tags=["Audits"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".xlsx"}

class AuditEditRequestCreate(BaseModel):
    audit_id: int
    requested_by: str
    reason: str

class AuditEditDecision(BaseModel):
    request_id: int
    decision: str
    manager_comment: Optional[str] = ""

class AuditUpdateRequest(BaseModel):
    audit_id: int
    modified_by: str
    change_reason: str
    updated_fields: Dict[str, Any]

class AuditStatusUpdate(BaseModel):
    status: str
    reason: Optional[str] = ""
    manager_name: Optional[str] = "Manager Jakości"

class HoldLotRequest(BaseModel):
    reason: Optional[str] = "Zarządzenie procedury wstrzymania partii (HOLD LOT)"
    manager_name: Optional[str] = "Manager Jakości"


@router.post("/api/audit")
async def save_audit(
    auditor_id: str = Form(...), line: str = Form(...), shift: str = Form(...), zone: str = Form(...),
    health_ok: str = Form("TAK"), dispense_no: str = Form("BRAK"), glass_plastic_ok: str = Form("ZGODNY"),
    allergen_clean_ok: str = Form("ZGODNY"), wood_policy_ok: str = Form("ZGODNY"), ppe_ok: str = Form("ZGODNY"),
    line_status: str = Form("Produkcja Ciągła"), ccp1_fe_ok: str = Form("ZGODNY"), ccp1_nonfe_ok: str = Form("ZGODNY"),
    ccp1_ss_ok: str = Form("ZGODNY"), ccp1_reject_ok: str = Form("ZGODNY"), ccp1_bin_locked: str = Form("ZGODNY"),
    ccp2_magnet_ok: str = Form("ZGODNY"), ccp3_sieve_ok: str = Form("ZGODNY"), gmp_cleanliness_ok: str = Form("ZGODNY"),
    gmp_wood_score: int = Form(5), gmp_foreign_score: int = Form(5), gmp_waste_ok: str = Form("ZGODNY"),
    bhp_estop_ok: str = Form("ZGODNY"), bhp_atex_ok: str = Form("ZGODNY"), bhp_hot_cip_ok: str = Form("ZGODNY"),
    bhp_evac_ppoz_ok: str = Form("ZGODNY"), bhp_status: str = Form("BRAK ZGŁOSZEŃ"), slm_analysis: str = Form(""),
    checklist_results: str = Form("{}"), photo: Optional[UploadFile] = File(None), notes: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    photo_path = None
    if photo and photo.filename:
        ext = os.path.splitext(photo.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Niedozwolony format pliku")
        
        # Walidacja Magic Bytes (ISO 27001 A.8.28)
        header_bytes = await photo.read(8)
        await photo.seek(0)
        is_valid_magic = False
        if ext in [".jpg", ".jpeg"] and header_bytes.startswith(b"\xff\xd8\xff"):
            is_valid_magic = True
        elif ext == ".png" and header_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            is_valid_magic = True
        elif ext == ".pdf" and header_bytes.startswith(b"%PDF"):
            is_valid_magic = True
        elif ext == ".xlsx" and header_bytes.startswith(b"PK\x03\x04"):
            is_valid_magic = True

        if not is_valid_magic:
            raise HTTPException(status_code=400, detail="Plik odrzucony: sygnatura binarna nie zgadza się z deklarowanym rozszerzeniem (ochrona MIME ISO 27001)")

        fname = f"{uuid.uuid4()}{ext}"
        dst = os.path.join(UPLOAD_DIR, fname)
        with open(dst, "wb") as f: 
            shutil.copyfileobj(photo.file, f)
        photo_path = f"/uploads/{fname}"

    # Ekstrakcja uwag (w tym podyktowanych głosem) z pytań checklisty dla RAG i SLM
    chk_notes_list = []
    ko_failed_flag = 0
    try:
        parsed_chk = json.loads(checklist_results) if checklist_results else {}
        for q_id, q_data in parsed_chk.items():
            if isinstance(q_data, dict):
                n_text = str(q_data.get("notes", "")).strip()
                if n_text:
                    cl = q_data.get("clause") or f"Pkt {q_id}"
                    chk_notes_list.append(f"[{cl}]: {n_text}")
                if q_data.get("status") == "NOK" and q_data.get("is_ko"):
                    ko_failed_flag = 1
    except Exception as e_chk:
        print(f"Błąd parsowania checklist_results: {e_chk}")

    extracted_notes = "; ".join(chk_notes_list) if chk_notes_list else ""
    full_notes = ((notes.strip() + " | " + extracted_notes) if (notes and notes.strip() and extracted_notes) else (notes.strip() if (notes and notes.strip()) else extracted_notes)) or None

    # Wstępna natychmiastowa ocena regułowa (< 1 ms)
    rule_nok = (
        ccp1_fe_ok == "NOK" or ccp1_reject_ok == "NOK" or ccp2_magnet_ok == "NOK" or
        ccp3_sieve_ok == "NOK" or health_ok != "TAK" or ko_failed_flag == 1 or
        (slm_analysis and ("NOK" in slm_analysis.upper() or "HOLD LOT" in slm_analysis.upper()))
    )
    initial_verdict = "NOK" if rule_nok else "OK"
    initial_risk = "KRYTYCZNE (HOLD LOT)" if (ko_failed_flag == 1 or (slm_analysis and "HOLD LOT" in slm_analysis.upper())) else ("ŚREDNIE" if rule_nok else "NISKIE")
    initial_analysis = slm_analysis if slm_analysis else "Weryfikacja regułowa zakończona. Analiza asystenta SLM AI trwa w tle..."

    # BŁYSKAWICZNY ZAPIS DO BAZY DANYCH (< 30 ms)
    async with get_db() as db:
        cursor = await db.execute("""
            INSERT INTO audits (timestamp, 
                auditor_id, line, shift, zone, health_ok, dispense_no, glass_plastic_ok, allergen_clean_ok, wood_policy_ok, ppe_ok, 
                line_status, ccp1_fe_ok, ccp1_nonfe_ok, ccp1_ss_ok, ccp1_reject_ok, ccp1_bin_locked, ccp2_magnet_ok, ccp3_sieve_ok,
                gmp_cleanliness_ok, gmp_wood_score, gmp_foreign_score, gmp_waste_ok, bhp_estop_ok, bhp_atex_ok, bhp_hot_cip_ok, 
                bhp_evac_ppoz_ok, bhp_status, slm_analysis, slm_verdict, risk_level, checklist_results, photo_path, notes, ko_failed
            ) VALUES (datetime('now', 'localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            auditor_id, line, shift, zone, health_ok, dispense_no, glass_plastic_ok, allergen_clean_ok, wood_policy_ok, ppe_ok, 
            line_status, ccp1_fe_ok, ccp1_nonfe_ok, ccp1_ss_ok, ccp1_reject_ok, ccp1_bin_locked, ccp2_magnet_ok, ccp3_sieve_ok,
            gmp_cleanliness_ok, gmp_wood_score, gmp_foreign_score, gmp_waste_ok, bhp_estop_ok, bhp_atex_ok, bhp_hot_cip_ok, 
            bhp_evac_ppoz_ok, bhp_status, initial_analysis, initial_verdict, initial_risk, checklist_results, photo_path, full_notes, ko_failed_flag
        ))
        audit_id = cursor.lastrowid
        await db.execute("UPDATE audit_schedules SET status = 'WYKONANY', completed_at = CURRENT_TIMESTAMP WHERE line = ? AND status = 'PLANOWANY'", (line,))
        await db.commit()

    # ASYNCHRONICZNE TŁO (BACKGROUND TASK): Uruchomienie modelu SLM AI bez blokowania odpowiedzi HTTP
    async def process_slm_background(a_id: int, a_line: str, audit_info: dict):
        try:
            analysis_result = await run_agent_turn(audit_info, a_line)
            v_bg = "NOK" if ("NOK" in analysis_result.upper() or "HOLD LOT" in analysis_result.upper()) else "OK"
            r_bg = "KRYTYCZNE (HOLD LOT)" if "HOLD LOT" in analysis_result.upper() else ("ŚREDNIE" if v_bg == "NOK" else "NISKIE")
            async with get_db() as conn_bg:
                await conn_bg.execute("""
                    UPDATE audits 
                    SET slm_analysis = ?, slm_verdict = ?, risk_level = ? 
                    WHERE id = ?
                """, (analysis_result, v_bg, r_bg, a_id))
                await conn_bg.commit()
        except Exception as e_bg:
            print(f"[BACKGROUND SLM ERROR] Błąd w tle dla audytu #{a_id}: {e_bg}")

    audit_payload_for_ai = {
        "line": line,
        "ccp1_fe_ok": ccp1_fe_ok,
        "ccp1_reject_ok": ccp1_reject_ok,
        "health_ok": health_ok,
        "notes": full_notes or ""
    }
    background_tasks.add_task(process_slm_background, audit_id, line, audit_payload_for_ai)

    return {
        "status": "OK",
        "audit_id": audit_id,
        "slm_verdict": initial_verdict,
        "risk_level": initial_risk,
        "message": "Audyt został natychmiastowo zarejestrowany. Analiza SLM przetwarzana asynchronicznie w tle."
    }


# --- AUDIT TRAIL / WNIOSKOWANIE O ZMIANĘ (WARIANT 3) ---
@router.post("/api/audits/request-edit")
async def request_audit_edit(payload: AuditEditRequestCreate):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, record_status FROM audits WHERE id = ?", (payload.audit_id,))
        audit = await c.fetchone()
        if not audit:
            raise HTTPException(status_code=404, detail="Audyt nie istnieje.")
        
        await c.execute("SELECT id FROM audit_edit_requests WHERE audit_id = ? AND status = 'OCZEKUJE'", (payload.audit_id,))
        pending = await c.fetchone()
        if pending:
            raise HTTPException(status_code=400, detail="Wniosek dla tego audytu już oczekuje na decyzję Managera.")

        await c.execute(
            "INSERT INTO audit_edit_requests (audit_id, requested_by, reason, status) VALUES (?, ?, ?, 'OCZEKUJE')",
            (payload.audit_id, payload.requested_by, payload.reason.strip())
        )
        await conn.commit()
    return {"status": "OK", "message": "Wniosek przesłany do Managera Jakości."}

@router.get("/api/audits/edit-requests")
async def list_edit_requests(
    status_filter: Optional[str] = None,
    manager: dict = Depends(require_manager)
):
    async with get_db() as conn:
        c = await conn.cursor()
        if status_filter:
            await c.execute("""
                SELECT r.id, r.audit_id, r.requested_by, r.reason, r.status, r.manager_comment, r.created_at, r.resolved_at, a.line, a.timestamp as audit_date
                FROM audit_edit_requests r
                JOIN audits a ON a.id = r.audit_id
                WHERE r.status = ?
                ORDER BY r.id DESC
            """, (status_filter,))
        else:
            await c.execute("""
                SELECT r.id, r.audit_id, r.requested_by, r.reason, r.status, r.manager_comment, r.created_at, r.resolved_at, a.line, a.timestamp as audit_date
                FROM audit_edit_requests r
                JOIN audits a ON a.id = r.audit_id
                ORDER BY r.id DESC
            """)
        rows = await c.fetchall()
    return [dict(r) for r in rows]

@router.post("/api/audits/decide-edit")
async def decide_audit_edit(
    payload: AuditEditDecision,
    request: Request,
    manager: dict = Depends(require_manager)
):
    if payload.decision not in ["ZATWIERDZONY", "ODRZUCONY"]:
        raise HTTPException(status_code=400, detail="Nieprawidłowa decyzja.")

    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT audit_id FROM audit_edit_requests WHERE id = ?", (payload.request_id,))
        req = await c.fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Wniosek nie istnieje.")

        await c.execute("""
            UPDATE audit_edit_requests 
            SET status = ?, manager_comment = ?, resolved_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        """, (payload.decision, payload.manager_comment, payload.request_id))

        if payload.decision == "ZATWIERDZONY":
            await c.execute("UPDATE audits SET record_status = 'ODBLOKOWANY_DO_KOREKTY' WHERE id = ?", (req["audit_id"],))

        await conn.commit()
    return {"status": "OK", "decision": payload.decision}

@router.put("/api/audits/apply-correction")
async def apply_audit_correction(payload: AuditUpdateRequest, current_user: dict = Depends(require_auditor_or_manager)):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT * FROM audits WHERE id = ?", (payload.audit_id,))
        audit = await c.fetchone()
        if not audit:
            raise HTTPException(status_code=404, detail="Audyt nie istnieje.")
        
        if audit["record_status"] != "ODBLOKOWANY_DO_KOREKTY":
            raise HTTPException(status_code=403, detail="Audyt jest zablokowany. Wymagana zgoda Managera.")

        ALLOWED_AUDIT_COLUMNS = {
            "auditor_id", "line", "shift", "zone", "audit_type", "compliance_verdict", "total_score_pct",
            "health_ok", "dispense_no", "ppe_ok", "allergen_clean_ok", "wood_policy_ok", "line_status",
            "ccp1_fe_ok", "ccp1_nonfe_ok", "ccp1_ss_ok", "ccp1_reject_ok", "ccp1_bin_locked", "ccp2_magnet_ok",
            "ccp3_sieve_ok", "cleanliness_rating", "risk_level", "slm_verdict", "notes", "glass_plastic_ok",
            "gmp_cleanliness_ok", "gmp_wood_score", "gmp_foreign_score", "gmp_waste_ok", "bhp_estop_ok",
            "bhp_atex_ok", "bhp_hot_cip_ok", "bhp_evac_ppoz_ok", "bhp_status", "checklist_results"
        }

        audit_dict = dict(audit)
        for field, new_val in payload.updated_fields.items():
            if field in audit_dict and field in ALLOWED_AUDIT_COLUMNS:
                old_val = str(audit_dict[field]) if audit_dict[field] is not None else ""
                new_val_str = str(new_val) if new_val is not None else ""
                if old_val != new_val_str:
                    await c.execute("""
                        INSERT INTO audit_change_logs (audit_id, modified_by, field_name, old_value, new_value, change_reason)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (payload.audit_id, current_user["full_name"], field, old_val, new_val_str, payload.change_reason))
                    await c.execute(f"UPDATE audits SET {field} = ? WHERE id = ?", (new_val, payload.audit_id))

        # Ponowna blokada po zapisie zmian
        await c.execute("UPDATE audits SET record_status = 'ZABLOKOWANY' WHERE id = ?", (payload.audit_id,))
        await conn.commit()

    await log_security_event(
        event_type="AUDIT_CORRECTION_APPLIED",
        user_id=current_user["uid"],
        user_name=current_user["sub"],
        severity="INFO",
        details=f"Użytkownik {current_user['full_name']} zapisał korektę audytu #{payload.audit_id} (powód: {payload.change_reason})"
    )
    return {"status": "OK", "message": "Korekta została zarejestrowana w dzienniku Audit Trail."}

@router.get("/api/audits/{audit_id}/audit-trail")
async def get_audit_trail(audit_id: int):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            SELECT modified_by, field_name, old_value, new_value, change_reason, timestamp 
            FROM audit_change_logs 
            WHERE audit_id = ? 
            ORDER BY id DESC
        """, (audit_id,))
        logs = await c.fetchall()
    return [dict(l) for l in logs]

@router.get("/api/audits/{audit_id}")
async def get_audit_detail(audit_id: int):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT * FROM audits WHERE id = ?", (audit_id,))
        row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Audyt nie został odnaleziony.")
        audit_data = dict(row)

        await c.execute("""
            SELECT modified_by, field_name, old_value, new_value, change_reason, timestamp 
            FROM audit_change_logs 
            WHERE audit_id = ? 
            ORDER BY id DESC
        """, (audit_id,))
        logs = await c.fetchall()
        audit_data["change_logs"] = [dict(l) for l in logs]

        # Bezpieczne parsowanie checklist_results
        if audit_data.get("checklist_results"):
            try:
                audit_data["checklist_parsed"] = json.loads(audit_data["checklist_results"])
            except Exception:
                audit_data["checklist_parsed"] = {}
        else:
            audit_data["checklist_parsed"] = {}

        # Bezpieczne parsowanie slm_analysis
        if audit_data.get("slm_analysis"):
            try:
                audit_data["slm_analysis_parsed"] = json.loads(audit_data["slm_analysis"])
            except Exception:
                audit_data["slm_analysis_parsed"] = None
        else:
            audit_data["slm_analysis_parsed"] = None

    return audit_data

@router.patch("/api/audits/{audit_id}/status")
async def update_audit_status(
    audit_id: int,
    payload: AuditStatusUpdate,
    request: Request,
    manager: dict = Depends(require_auditor_or_manager)
):
    if payload.status not in ["ZATWIERDZONY", "ODRZUCONY", "WERYFIKACJA"]:
        raise HTTPException(status_code=400, detail="Nieprawidłowy status audytu.")

    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, compliance_verdict, process_status FROM audits WHERE id = ?", (audit_id,))
        audit = await c.fetchone()
        if not audit:
            raise HTTPException(status_code=404, detail="Audyt nie istnieje.")

        old_status = audit["compliance_verdict"] or audit["process_status"] or "NOWY"
        mgr = manager.get("full_name") or manager.get("sub") or "Manager Jakości"
        await c.execute("""
            UPDATE audits 
            SET compliance_verdict = ?, process_status = ?, signoff_quality = ?
            WHERE id = ?
        """, (payload.status, payload.status, mgr, audit_id))

        reason = payload.reason.strip() if payload.reason else f"Formalna zmiana statusu audytu na: {payload.status}"
        await c.execute("""
            INSERT INTO audit_change_logs (audit_id, modified_by, field_name, old_value, new_value, change_reason)
            VALUES (?, ?, 'status_zatwierdzenia', ?, ?, ?)
        """, (audit_id, mgr, old_status, payload.status, reason))

        await conn.commit()

    client_ip = request.client.host if request.client else "127.0.0.1"
    await log_security_event(
        event_type="AUDIT_STATUS_CHANGED",
        user_id=manager.get("uid", 0),
        user_name=manager.get("sub", mgr),
        ip_address=client_ip,
        severity="INFO",
        details=f"Zmiana statusu audytu #{audit_id} na {payload.status} ({reason})"
    )
    return {"status": "OK", "new_status": payload.status}

@router.post("/api/audits/{audit_id}/hold-lot")
async def trigger_hold_lot(
    audit_id: int,
    payload: HoldLotRequest,
    request: Request,
    manager: dict = Depends(require_manager)
):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, line, slm_verdict FROM audits WHERE id = ?", (audit_id,))
        audit = await c.fetchone()
        if not audit:
            raise HTTPException(status_code=404, detail="Audyt nie istnieje.")

        mgr = manager["sub"]
        await c.execute("""
            UPDATE audits 
            SET risk_level = 'KRYTYCZNE (HOLD LOT)', compliance_verdict = 'HOLD_LOT'
            WHERE id = ?
        """, (audit_id,))

        reason = payload.reason or "Natychmiastowe zarządzenie procedury wstrzymania partii (HOLD LOT) przez Managera Jakości."
        await c.execute("""
            INSERT INTO audit_change_logs (audit_id, modified_by, field_name, old_value, new_value, change_reason)
            VALUES (?, ?, 'HOLD_LOT_PROCEDURA', 'NORMALNA', 'KWARANTANNA_HOLD_LOT', ?)
        """, (audit_id, mgr, reason))

        await conn.commit()

    client_ip = request.client.host if request.client else "127.0.0.1"
    await log_security_event(
        event_type="HOLD_LOT_TRIGGERED",
        user_id=manager["uid"],
        user_name=manager["sub"],
        ip_address=client_ip,
        severity="CRITICAL",
        details=f"Wstrzymanie partii (HOLD LOT) dla audytu #{audit_id} na linii {audit['line']}"
    )
    return {"status": "OK", "message": f"Wstrzymanie partii (HOLD LOT) zostało zarejestrowane dla linii {audit['line']}."}

@router.get("/api/audits")
async def get_all_audits(limit: int = 300):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            SELECT id, auditor_id, line, shift, slm_verdict, risk_level, timestamp, record_status,
                   compliance_verdict, process_status, notes, total_score_pct, audit_score, audit_points,
                   checklist_results
            FROM audits 
            ORDER BY id DESC LIMIT ?
        """, (limit,))
        rows = [dict(r) for r in await c.fetchall()]
    return rows

@router.delete("/api/audits/{audit_id}")
async def undo_last_audit(
    audit_id: int,
    request: Request,
    current_user: dict = Depends(require_auditor_or_manager)
):
    """Pozwala usunąć wpis przez audytora lub managera z audytem ISO 27001"""
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, line, record_status FROM audits WHERE id = ?", (audit_id,))
        row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Nie odnaleziono audytu")
            
        await c.execute("DELETE FROM audits WHERE id = ?", (audit_id,))
        await c.execute("UPDATE audit_schedules SET status = 'PLANOWANY', completed_at = NULL WHERE line = ? AND status = 'WYKONANY'", (row["line"],))
        await conn.commit()

    client_ip = request.client.host if request.client else "127.0.0.1"
    await log_security_event(
        event_type="AUDIT_DELETED",
        user_id=current_user["uid"],
        user_name=current_user["sub"],
        ip_address=client_ip,
        severity="WARN",
        details=f"Usunięto rekord audytu ID={audit_id} na linii {row['line']}"
    )
    return {"status": "OK", "message": "Audyt został usunięty."}

