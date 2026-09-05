import os
import json
import base64
import secrets
import aiosqlite
import shutil
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Form, UploadFile, File, Query, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.worksheet.table import Table, TableStyleInfo
from collections import Counter 
from agent import analyze_audit_risk, run_agent_turn

from database import get_db, run_migrations, DB_PATH

UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_migrations()
    yield

app = FastAPI(title="Quality Audit Enterprise", lifespan=lifespan)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".xlsx"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")



class ScheduleCreateModel(BaseModel):
    scheduled_date: str
    audit_type: str
    line: str
    lead_auditor: str
    backup_auditor: str
    notes: Optional[str] = ""

class ScheduleUpdateModel(BaseModel):
    scheduled_date: str
    audit_type: str
    line: str
    lead_auditor: str
    backup_auditor: str
    status: str
    notes: Optional[str] = ""

class AutoPlanModel(BaseModel):
    start_year: int
    start_month: int
    period_months: int
    lines: List[str]
    audit_types: List[str]
    include_weekends: bool = False

class AgentChatModel(BaseModel):
    message: str
    user_name: str
    user_role: str

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


# --- ROUTING I INTERFEJS GŁÓWNY ---
@app.get("/", response_class=HTMLResponse)
def read_root():
    template_path = os.path.join(BASE_DIR, "templates", "index.html")
    root_path = os.path.join(BASE_DIR, "index.html")
    final_path = template_path if os.path.exists(template_path) else root_path
    
    if os.path.exists(final_path):
        return FileResponse(final_path)
    return HTMLResponse(f"<h1>Błąd 404: Brak pliku index.html</h1>", status_code=404)


# --- AUTORYZACJA PIN & FIDO2 BIOMETRIA ---
@app.post("/api/auth/login")
async def auth_login(payload: PinLoginModel):
    async with get_db() as conn:
        async with conn.execute("SELECT id, pin, full_name, role FROM users WHERE pin = ? AND is_active = 1", (payload.pin.strip(),)) as cursor:
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(status_code=401, detail="Nieprawidłowy kod PIN")
            return dict(row)

@app.post("/api/auth/biometric/register-challenge")
def bio_reg_challenge(user_id: int = Query(...)):
    raw = secrets.token_bytes(32)
    b64 = base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')
    return {"challenge": b64}

@app.post("/api/auth/biometric/register-verify")
async def bio_reg_verify(payload: BiometricRegisterVerifyModel):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("UPDATE users SET biometric_cred_id = ? WHERE id = ?", (payload.credential_id, payload.user_id))
        await conn.commit()
    return {"status": "OK"}

@app.get("/api/auth/biometric/login-challenge")
def bio_login_challenge():
    raw = secrets.token_bytes(32)
    b64 = base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')
    return {"challenge": b64}

@app.post("/api/auth/biometric/login-verify")
async def bio_login_verify(payload: BiometricLoginVerifyModel):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, pin, full_name, role FROM users WHERE biometric_cred_id = ? AND is_active = 1", (payload.credential_id,))
        row = await c.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Nie rozpoznano poświadczenia biometrycznego")
    return dict(row)

@app.get("/api/auth/auditors")
async def get_auditors_list(type: Optional[str] = None):
    async with get_db() as conn:
        cursor = await conn.execute("SELECT full_name, qualifications FROM users WHERE is_active = 1 AND role IN ('AUDITOR', 'MANAGER')")
        rows = await cursor.fetchall()
        
    filtered_rows = []
    for row in rows:
        quals = row["qualifications"] or ""
        if not type or type in quals:
            filtered_rows.append(row)
            
    return [row["full_name"] for row in filtered_rows]


@app.get("/api/users")
async def list_users(role: str = Query("MANAGER")):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, pin, full_name, role, qualifications FROM users WHERE is_active = 1")
        rows = await c.fetchall()
    out = []
    for r in rows:
        # Zabezpieczenie przed błędem JSONDecodeError w bazie danych
        try:
            quals = json.loads(r["qualifications"]) if r["qualifications"] else []
        except json.JSONDecodeError:
            quals = ["HACCP", "GMP", "GHP"]

        out.append({
            "id": r["id"], 
            "pin": r["pin"], 
            "full_name": r["full_name"],
            "role": r["role"], 
            "qualifications": quals
        })
    return out
@app.post("/api/users")
async def add_user(payload: UserCreateModel, role: str = Query("MANAGER")):
    if role != "MANAGER": raise HTTPException(status_code=403, detail="Brak uprawnień")
    async with get_db() as conn:
        c = await conn.cursor()
        try:
            await c.execute("""
                INSERT INTO users (pin, full_name, role, qualifications, is_active)
                VALUES (?, ?, ?, ?, 1)
            """, (payload.pin.strip(), payload.full_name.strip(), payload.role, json.dumps(payload.qualifications)))
            await conn.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(status_code=400, detail="Użytkownik z tym PIN już istnieje")
    return {"status": "OK"}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, role: str = Query("MANAGER")):
    if role != "MANAGER": raise HTTPException(status_code=403, detail="Brak uprawnień")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("UPDATE users SET is_active = 0 WHERE id = ? AND pin != '9999'", (user_id,))
        await conn.commit()
    return {"status": "OK"}


# --- LINIE PRODUKCYJNE ---
@app.get("/api/lines")
async def list_lines():
    async with get_db() as conn:
        cursor = await conn.execute("SELECT id, name, code, default_zone FROM production_lines WHERE is_active = 1 ORDER BY name ASC")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

@app.post("/api/lines")
async def create_line(payload: LineCreateModel):
    async with get_db() as conn:
        await conn.execute(
            "INSERT INTO production_lines (name, code, default_zone, is_active) VALUES (?, ?, ?, 1)",
            (payload.name, payload.code, payload.default_zone)
        )
        await conn.commit()
    return {"status": "success"}

@app.delete("/api/lines/{line_id}")
async def delete_line(line_id: int):
    async with get_db() as conn:
        await conn.execute("UPDATE production_lines SET is_active = 0 WHERE id = ?", (line_id,))
        await conn.commit()
    return {"status": "success"}


# --- HARMONOGRAMY ---
@app.get("/api/schedule")
async def get_schedules(auditor: Optional[str] = None, role: Optional[str] = "MANAGER"):
    async with get_db() as conn:
        c = await conn.cursor()
        if role == "MANAGER" or not auditor:
            await c.execute("SELECT * FROM audit_schedules ORDER BY scheduled_date ASC")
        else:
            await c.execute("""
                SELECT * FROM audit_schedules 
                WHERE lead_auditor LIKE ? OR backup_auditor LIKE ?
                ORDER BY scheduled_date ASC
            """, (f"%{auditor}%", f"%{auditor}%"))
        rows = [dict(r) for r in await c.fetchall()]
    return rows

@app.post("/api/schedule")
async def add_schedule(payload: ScheduleCreateModel):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            INSERT INTO audit_schedules (scheduled_date, audit_type, line, lead_auditor, backup_auditor, status, notes)
            VALUES (?, ?, ?, ?, ?, 'PLANOWANY', ?)
        """, (payload.scheduled_date, payload.audit_type, payload.line, payload.lead_auditor, payload.backup_auditor, payload.notes))
        await conn.commit()
    return {"status": "OK"}

@app.get("/api/schedule/{sched_id}")
async def get_single_schedule(sched_id: int):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT * FROM audit_schedules WHERE id = ?", (sched_id,))
        row = await c.fetchone()
    if not row: raise HTTPException(status_code=404, detail="Brak zlecenia")
    return dict(row)

@app.put("/api/schedule/{sched_id}")
async def update_schedule(sched_id: int, payload: ScheduleUpdateModel):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            UPDATE audit_schedules 
            SET scheduled_date = ?, audit_type = ?, line = ?, lead_auditor = ?, backup_auditor = ?, status = ?, notes = ?
            WHERE id = ?
        """, (payload.scheduled_date, payload.audit_type, payload.line, payload.lead_auditor, payload.backup_auditor, payload.status, payload.notes, sched_id))
        await conn.commit()
    return {"status": "OK"}

@app.delete("/api/schedule/{sched_id}")
async def delete_schedule(sched_id: int):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("DELETE FROM audit_schedules WHERE id = ?", (sched_id,))
        await conn.commit()
    return {"status": "OK"}

@app.post("/api/schedule/auto")
async def auto_generate_schedule(payload: AutoPlanModel):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT full_name FROM users WHERE is_active = 1 AND role = 'AUDITOR'")
        auditors = [r["full_name"] for r in await c.fetchall()]
        if len(auditors) < 2:
            auditors = ["G. Zarakowski (Lead)", "P. Kowalski (Audytor)", "A. Nowak (Audytor)"]

        start_date = datetime(payload.start_year, payload.start_month, 1)
        end_date = start_date + timedelta(days=payload.period_months * 30)

        count = 0
        cur = start_date
        line_idx = type_idx = aud_idx = 0

        while cur <= end_date:
            if not payload.include_weekends and cur.weekday() in (5, 6):
                cur += timedelta(days=1)
                continue

            assigned_line = payload.lines[line_idx % len(payload.lines)]
            assigned_type = payload.audit_types[type_idx % len(payload.audit_types)]
            lead = auditors[aud_idx % len(auditors)]
            backup = auditors[(aud_idx + 1) % len(auditors)]
            
            await c.execute("""
                INSERT INTO audit_schedules (scheduled_date, audit_type, line, lead_auditor, backup_auditor, status, notes)
                VALUES (?, ?, ?, ?, ?, 'PLANOWANY', 'Generacja AI (Optymalizacja IFS Food v8)')
            """, (cur.strftime("%Y-%m-%d"), assigned_type, assigned_line, lead, backup))

            count += 1
            line_idx += 1; type_idx += 1; aud_idx += 1
            cur += timedelta(days=3)

        await conn.commit()
    return {"count": count}


# --- WYKONYWANIE AUDYTÓW I SLM ---
@app.get("/api/checklist-template/{audit_type}")
def get_checklist_template(audit_type: str):
    return CHECKLIST_TEMPLATES.get(audit_type.upper().strip(), CHECKLIST_TEMPLATES["HACCP"])

@app.post("/api/slm-analyze")
async def slm_analyze(payload: dict):
    res = await analyze_audit_risk(payload)
    return res

@app.post("/api/audit")
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
    checklist_results: str = Form("{}"), photo: Optional[UploadFile] = File(None)
):
    photo_path = None
    if photo and photo.filename:
        ext = os.path.splitext(photo.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Niedozwolony format pliku")
        fname = f"{uuid.uuid4()}{ext}"
        dst = os.path.join(UPLOAD_DIR, fname)
        with open(dst, "wb") as f: 
            shutil.copyfileobj(photo.file, f)
        photo_path = f"/uploads/{fname}"

    # Asynchroniczne wywołanie agenta
    audit_data = {"line": line, "ccp1_fe_ok": ccp1_fe_ok, "ccp1_reject_ok": ccp1_reject_ok, "health_ok": health_ok}
    try:
        slm_analysis = await run_agent_turn(audit_data, line)
    except Exception as e:
        print(f"Agent error: {e}")
        slm_analysis = "Analiza SLM niedostępna (System offline)"

    slm_verdict = "NOK" if "NOK" in slm_analysis.upper() or "HOLD LOT" in slm_analysis.upper() else "OK"
    risk_lvl = "KRYTYCZNE (HOLD LOT)" if "HOLD LOT" in slm_analysis.upper() else "ŚREDNIE" if slm_verdict == "NOK" else "NISKIE"

    async with get_db() as db:
        await db.execute("""
            INSERT INTO audits (
                auditor_id, line, shift, zone, health_ok, dispense_no, glass_plastic_ok, allergen_clean_ok, wood_policy_ok, ppe_ok, 
                line_status, ccp1_fe_ok, ccp1_nonfe_ok, ccp1_ss_ok, ccp1_reject_ok, ccp1_bin_locked, ccp2_magnet_ok, ccp3_sieve_ok,
                gmp_cleanliness_ok, gmp_wood_score, gmp_foreign_score, gmp_waste_ok, bhp_estop_ok, bhp_atex_ok, bhp_hot_cip_ok, 
                bhp_evac_ppoz_ok, bhp_status, slm_analysis, slm_verdict, risk_level, checklist_results, photo_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            auditor_id, line, shift, zone, health_ok, dispense_no, glass_plastic_ok, allergen_clean_ok, wood_policy_ok, ppe_ok, 
            line_status, ccp1_fe_ok, ccp1_nonfe_ok, ccp1_ss_ok, ccp1_reject_ok, ccp1_bin_locked, ccp2_magnet_ok, ccp3_sieve_ok,
            gmp_cleanliness_ok, gmp_wood_score, gmp_foreign_score, gmp_waste_ok, bhp_estop_ok, bhp_atex_ok, bhp_hot_cip_ok, 
            bhp_evac_ppoz_ok, bhp_status, slm_analysis, slm_verdict, risk_lvl, checklist_results, photo_path
        ))
        await db.execute("UPDATE audit_schedules SET status = 'WYKONANY', completed_at = CURRENT_TIMESTAMP WHERE line = ? AND status = 'PLANOWANY' AND scheduled_date <= date('now')", (line,))
        await db.commit()
    
    return {"status": "OK", "slm_verdict": slm_verdict}


# --- AUDIT TRAIL / WNIOSKOWANIE O ZMIANĘ (WARIANT 3) ---
@app.post("/api/audits/request-edit")
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

@app.get("/api/audits/edit-requests")
async def list_edit_requests(role: str = Query("MANAGER")):
    if role != "MANAGER":
        raise HTTPException(status_code=403, detail="Tylko Manager ma dostęp do listy wniosków.")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            SELECT r.id, r.audit_id, r.requested_by, r.reason, r.status, r.created_at, a.line, a.timestamp as audit_date
            FROM audit_edit_requests r
            JOIN audits a ON a.id = r.audit_id
            WHERE r.status = 'OCZEKUJE'
            ORDER BY r.id DESC
        """)
        rows = await c.fetchall()
    return [dict(r) for r in rows]

@app.post("/api/audits/decide-edit")
async def decide_audit_edit(payload: AuditEditDecision, role: str = Query("MANAGER")):
    if role != "MANAGER":
        raise HTTPException(status_code=403, detail="Brak uprawnień.")
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

@app.put("/api/audits/apply-correction")
async def apply_audit_correction(payload: AuditUpdateRequest):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT * FROM audits WHERE id = ?", (payload.audit_id,))
        audit = await c.fetchone()
        if not audit:
            raise HTTPException(status_code=404, detail="Audyt nie istnieje.")
        
        if audit["record_status"] != "ODBLOKOWANY_DO_KOREKTY":
            raise HTTPException(status_code=403, detail="Audyt jest zablokowany. Wymagana zgoda Managera.")

        audit_dict = dict(audit)
        for field, new_val in payload.updated_fields.items():
            if field in audit_dict:
                old_val = str(audit_dict[field]) if audit_dict[field] is not None else ""
                new_val_str = str(new_val) if new_val is not None else ""
                if old_val != new_val_str:
                    await c.execute("""
                        INSERT INTO audit_change_logs (audit_id, modified_by, field_name, old_value, new_value, change_reason)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (payload.audit_id, payload.modified_by, field, old_val, new_val_str, payload.change_reason))
                    await c.execute(f"UPDATE audits SET {field} = ? WHERE id = ?", (new_val, payload.audit_id))

        # Ponowna blokada po zapisie zmian
        await c.execute("UPDATE audits SET record_status = 'ZABLOKOWANY' WHERE id = ?", (payload.audit_id,))
        await conn.commit()
    return {"status": "OK", "message": "Korekta została zarejestrowana w dzienniku Audit Trail."}

@app.get("/api/audits/{audit_id}/audit-trail")
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


# --- PODSTAWOWE WYNIKI I COFANIE AUDYTU ---
@app.get("/api/audits")
async def get_all_audits(limit: int = 50):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            SELECT id, auditor_id, line, shift, slm_verdict, risk_level, timestamp, record_status 
            FROM audits 
            ORDER BY id DESC LIMIT ?
        """, (limit,))
        rows = [dict(r) for r in await c.fetchall()]
    return rows

@app.delete("/api/audits/{audit_id}")
async def undo_last_audit(audit_id: int, role: str = Query(...)):
    """Pozwala usunąć wpis, o ile jest wciąż w buforze lub na polecenie managera"""
    if role not in ["MANAGER", "AUDITOR"]:
        raise HTTPException(status_code=403, detail="Brak uprawnień")
        
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, line, record_status FROM audits WHERE id = ?", (audit_id,))
        row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Nie odnaleziono audytu")
            
        await c.execute("DELETE FROM audits WHERE id = ?", (audit_id,))
        await c.execute("UPDATE audit_schedules SET status = 'PLANOWANY', completed_at = NULL WHERE line = ? AND status = 'WYKONANY'", (row["line"],))
        await conn.commit()
    return {"status": "OK", "message": "Audyt został usunięty."}


# --- CZAT AGENTA ---
@app.post("/api/agent/chat")
async def agent_chat(payload: AgentChatModel):
    reply = await run_agent_turn(
        audit_payload={"line": "Ogólna", "notes": payload.message, "user": payload.user_name, "role": payload.user_role},
        line_name="Ogólna"
    )
    return {"reply": reply}


# --- RAPORTY & EKSPORT EXCEL ---
@app.get("/api/reports/kpi")
async def get_kpi():
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT COUNT(*) FROM audits")
        total = (await c.fetchone())[0]

        await c.execute("SELECT COUNT(*) FROM audits WHERE slm_verdict = 'NOK'")
        incidents = (await c.fetchone())[0]

        compliant = total - incidents
        rate = round((compliant / total * 100), 1) if total > 0 else 100.0

        await c.execute("SELECT line, timestamp, slm_analysis FROM audits ORDER BY id DESC LIMIT 10")
        recent = [{"line": r[0], "timestamp": r[1], "slm_analysis": r[2]} for r in await c.fetchall()]
    
    return {
        "total_audits": total,
        "compliance_rate": rate,
        "incidents_count": incidents,
        "recent_audits": recent
    }

@app.get("/api/audits/export/excel")
async def export_excel():
    # Importy przeniesione do wnętrza funkcji, aby zapobiec błędom 500
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.chart import BarChart, PieChart, Reference
    from openpyxl.worksheet.table import Table, TableStyleInfo
    from collections import Counter

    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT * FROM audits ORDER BY id DESC")
        rows = [dict(r) for r in await c.fetchall()]

    wb = openpyxl.Workbook()
    
    # --- ARKUSZ 1: DASHBOARD  ---
    ws_dash = wb.active
    ws_dash.title = "Dashboard Admin"
    ws_dash.sheet_view.showGridLines = False
    
    # Nagłówek Dashboardu
    ws_dash.merge_cells('A1:J2')
    title_cell = ws_dash['A1']
    title_cell.value = "QUALITY AUDIT ENTERPRISE - DASHBOARD Admin IFS FOOD v8"
    title_cell.font = Font(name="Calibri", size=18, bold=True, color="FFFFFF")
    title_cell.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    
    # Obliczenia 
    total_audits = len(rows)
    nok_audits = sum(1 for r in rows if r.get("slm_verdict", "") == "NOK")
    ok_audits = total_audits - nok_audits
    compliance = round((ok_audits / total_audits * 100), 1) if total_audits > 0 else 100.0
    
    kpi_data = [
        ("Suma przeprowadzonych audytów:", total_audits),
        ("Wskaźnik zgodności IFS (Compliance):", f"{compliance}%"),
        ("Audyty w pełni zgodne (OK):", ok_audits),
        ("Złamania KO / Niezgodności (NOK):", nok_audits)
    ]
    
    for idx, (label, val) in enumerate(kpi_data, start=4):
        ws_dash.merge_cells(f'B{idx}:D{idx}')
        ws_dash[f'B{idx}'] = label
        ws_dash[f'B{idx}'].font = Font(size=12, bold=True, color="334155")
        ws_dash[f'B{idx}'].alignment = Alignment(horizontal="right")
        
        ws_dash[f'E{idx}'] = val
        ws_dash[f'E{idx}'].font = Font(size=14, bold=True, color="16A34A" if idx != 7 else "DC2626")
        ws_dash[f'E{idx}'].alignment = Alignment(horizontal="left")

    lines_counter = Counter([r.get("line", "Nieznana") for r in rows])
    
    ws_dash['A30'] = "Linia"
    ws_dash['B30'] = "Liczba Audytów"
    row_idx = 31
    for line, count in lines_counter.items():
        ws_dash[f'A{row_idx}'] = line
        ws_dash[f'B{row_idx}'] = count
        row_idx += 1
        
    ws_dash['D30'] = "Status"
    ws_dash['E30'] = "Ilość"
    ws_dash['D31'] = "ZGODNE (OK)"
    ws_dash['E31'] = ok_audits
    ws_dash['D32'] = "NIEZGODNE (NOK)"
    ws_dash['E32'] = nok_audits

    # Wykres Słupkowy
    if lines_counter:
        bar_chart = BarChart()
        bar_chart.type = "col"
        bar_chart.style = 10
        bar_chart.title = "Liczba Inspekcji na Linie"
        bar_chart.width = 14
        bar_chart.height = 7
        data1 = Reference(ws_dash, min_col=2, min_row=30, max_row=row_idx-1)
        cats1 = Reference(ws_dash, min_col=1, min_row=31, max_row=row_idx-1)
        bar_chart.add_data(data1, titles_from_data=True)
        bar_chart.set_categories(cats1)
        ws_dash.add_chart(bar_chart, "B10")
    
    # Wykres Kołowy
    if total_audits > 0:
        pie_chart = PieChart()
        pie_chart.title = "Podział Zgodności"
        pie_chart.width = 10
        pie_chart.height = 7
        labels = Reference(ws_dash, min_col=4, min_row=31, max_row=32)
        data2 = Reference(ws_dash, min_col=5, min_row=30, max_row=32)
        pie_chart.add_data(data2, titles_from_data=True)
        pie_chart.set_categories(labels)
        ws_dash.add_chart(pie_chart, "G10")

    # --- ARKUSZ 2: SZCZEGÓŁOWE DANE ---
    ws_data = wb.create_sheet(title="Rejestr Danych Audytowych")
    
    headers = [
        "ID", "Data i Czas", "Audytor", "Linia", "Zmiana", "Strefa", "Zdrowie PR15",
        "CCP1 Fe", "CCP1 Non-Fe", "CCP1 SS", "Ramię Odrzutu", "Kosz Zamknięty", 
        "Czystość (GMP)", "Orzeczenie AI", "Status Zapisu"
    ]
    ws_data.append(headers)
    
    for r in rows:
        ws_data.append([
            r.get("id", ""), r.get("timestamp", ""), r.get("auditor_id", ""), r.get("line", ""), 
            r.get("shift", ""), r.get("zone", ""), r.get("health_ok", ""), r.get("ccp1_fe_ok", ""), 
            r.get("ccp1_nonfe_ok", ""), r.get("ccp1_ss_ok", ""), r.get("ccp1_reject_ok", ""), 
            r.get("ccp1_bin_locked", ""), r.get("gmp_cleanliness_ok", ""), r.get("slm_analysis", ""), 
            r.get("record_status", "ZABLOKOWANY")
        ])
        
    if total_audits > 0:
        tab = Table(displayName="TabelaAudytow", ref=f"A1:O{total_audits+1}")
        style = TableStyleInfo(name="TableStyleMedium9", showFirstColumn=False,
                               showLastColumn=False, showRowStripes=True, showColumnStripes=False)
        tab.tableStyleInfo = style
        ws_data.add_table(tab)
    
    for col_idx in range(1, len(headers)+1):
        ws_data.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = 22

    out_file = os.path.join(BASE_DIR, "Raport_Dashboard_IFS_Enterprise.xlsx")
    wb.save(out_file)
    
    return FileResponse(
        out_file, 
        filename="Raport_Dashboard_IFS_Enterprise.xlsx", 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )