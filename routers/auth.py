import json
import secrets
import base64
import aiosqlite
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from database import get_db

from security import (
    verify_pin,
    hash_pin,
    create_access_token,
    log_security_event,
    check_rate_limit,
    record_login_failure,
    reset_login_failures,
    get_current_user,
    require_manager,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class PinLoginModel(BaseModel):
    pin: str
    expected_role: Optional[str] = None

class BiometricRegisterVerifyModel(BaseModel):
    user_id: int
    credential_id: str

class BiometricLoginVerifyModel(BaseModel):
    credential_id: str

class UserCreateModel(BaseModel):
    pin: str
    full_name: str
    role: str = "AUDITOR"
    qualifications: List[str] = ["HACCP", "GMP", "GHP"]

@router.post("/login")
@router.post("/login-pin")
async def auth_login(payload: PinLoginModel, request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    check_rate_limit(client_ip)

    clean_pin = payload.pin.strip()
    expected = payload.expected_role.strip().upper() if payload.expected_role else None

    async with get_db() as conn:
        if expected:
            cursor = await conn.execute(
                "SELECT id, pin, full_name, role, qualifications FROM users WHERE is_active = 1 AND UPPER(role) = ?",
                (expected,)
            )
        else:
            cursor = await conn.execute(
                "SELECT id, pin, full_name, role, qualifications FROM users WHERE is_active = 1"
            )
        rows = await cursor.fetchall()
        matched = None
        for row in rows:
            if verify_pin(clean_pin, row["pin"]):
                matched = row
                break

        if not matched:
            record_login_failure(client_ip)
            await log_security_event(
                event_type="LOGIN_FAILED",
                ip_address=client_ip,
                severity="WARN",
                details=f"Nieudana próba logowania kodem PIN. Oczekiwana rola: {expected or 'Brak'}"
            )
            detail_msg = (
                "Nieprawidłowy kod PIN dla konta Key User (Kierownik Jakości)."
                if expected == "MANAGER"
                else "Nieprawidłowy kod PIN dla konta Audytora."
                if expected == "AUDITOR"
                else "Nieprawidłowy kod PIN."
            )
            raise HTTPException(status_code=401, detail=detail_msg)

        reset_login_failures(client_ip)
        user_dict = dict(matched)
        token = create_access_token(user_dict)
        user_dict.pop("pin", None)
        await log_security_event(
            event_type="LOGIN_SUCCESS",
            user_id=user_dict["id"],
            user_name=user_dict["full_name"],
            ip_address=client_ip,
            severity="INFO",
            details=f"Pomyślne logowanie PIN. Rola: {user_dict['role']}"
        )
        return {
            "id": user_dict["id"],
            "full_name": user_dict["full_name"],
            "role": user_dict["role"],
            "qualifications": user_dict.get("qualifications"),
            "access_token": token,
            "token_type": "Bearer",
            "user": user_dict
        }

@router.post("/biometric/register-challenge")
def bio_reg_challenge(user_id: int = Query(...)):
    raw = secrets.token_bytes(32)
    b64 = base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')
    return {"challenge": b64}

@router.post("/biometric/register-verify")
async def bio_reg_verify(payload: BiometricRegisterVerifyModel, current_user: dict = Depends(get_current_user)):
    if not (current_user.get("role") == "MANAGER" or current_user.get("uid") == payload.user_id):
        raise HTTPException(status_code=403, detail="Brak uprawnień do rejestracji biometrii dla tego użytkownika")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("UPDATE users SET biometric_cred_id = ? WHERE id = ?", (payload.credential_id, payload.user_id))
        await conn.commit()
    return {"status": "OK"}

@router.get("/biometric/login-challenge")
def bio_login_challenge():
    raw = secrets.token_bytes(32)
    b64 = base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')
    return {"challenge": b64}

@router.post("/biometric/login-verify")
async def bio_login_verify(payload: BiometricLoginVerifyModel):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, pin, full_name, role, qualifications FROM users WHERE biometric_cred_id = ? AND is_active = 1", (payload.credential_id,))
        row = await c.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Nieprawidłowe poświadczenie biometryczne")
    user_dict = dict(row)
    token = create_access_token(user_dict)
    user_dict.pop("pin", None)
    return {
        "id": user_dict["id"],
        "full_name": user_dict["full_name"],
        "role": user_dict["role"],
        "qualifications": user_dict.get("qualifications"),
        "access_token": token,
        "token_type": "Bearer",
        "user": user_dict
    }

@router.get("/auditors")
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

@router.get("/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, full_name, role, qualifications FROM users WHERE is_active = 1")
        rows = await c.fetchall()
    out = []
    for r in rows:
        try:
            quals = json.loads(r["qualifications"]) if r["qualifications"] else []
        except (json.JSONDecodeError, TypeError):
            quals = ["HACCP", "GMP", "GHP"]

        out.append({
            "id": r["id"], 
            "full_name": r["full_name"],
            "role": r["role"], 
            "qualifications": quals
        })
    return out

@router.post("/users")
async def add_user(payload: UserCreateModel, manager: dict = Depends(require_manager)):
    clean_pin = payload.pin.strip()
    clean_name = payload.full_name.strip()
    if len(clean_pin) < 3:
        raise HTTPException(status_code=400, detail="Kod PIN musi zawierać co najmniej 3 znaki")
    if not clean_name:
        raise HTTPException(status_code=400, detail="Wprowadź imię i nazwisko użytkownika")

    hashed_pin = hash_pin(clean_pin)

    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, pin FROM users WHERE is_active = 1")
        all_users = await c.fetchall()
        for u in all_users:
            if verify_pin(clean_pin, u["pin"]):
                raise HTTPException(status_code=400, detail="Ten kod PIN jest już zajęty przez innego użytkownika")

        try:
            await c.execute("""
                INSERT INTO users (pin, full_name, role, qualifications, is_active)
                VALUES (?, ?, ?, ?, 1)
            """, (hashed_pin, clean_name, payload.role, json.dumps(payload.qualifications)))
            await conn.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(status_code=400, detail="Użytkownik z tym PIN już istnieje")
    return {"status": "OK"}

class UserUpdateModel(BaseModel):
    pin: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    qualifications: Optional[List[str]] = None
    zones: Optional[List[str]] = None
    notes: Optional[str] = None

@router.put("/users/{user_id}")
async def update_user(user_id: int, payload: UserUpdateModel, manager: dict = Depends(require_manager)):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, pin, full_name, role, qualifications, notes FROM users WHERE id = ?", (user_id,))
        user = await c.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Użytkownik nie istnieje")
        
        if payload.pin and payload.pin.strip():
            new_pin_clean = payload.pin.strip()
            if len(new_pin_clean) < 3:
                raise HTTPException(status_code=400, detail="Kod PIN musi zawierać co najmniej 3 znaki")
            
            await c.execute("SELECT id, pin FROM users WHERE id != ? AND is_active = 1", (user_id,))
            others = await c.fetchall()
            for o in others:
                if verify_pin(new_pin_clean, o["pin"]):
                    raise HTTPException(status_code=400, detail="Ten kod PIN jest już przypisany do innego użytkownika")
            stored_pin_val = hash_pin(new_pin_clean)
        else:
            stored_pin_val = user["pin"]
            
        new_name = payload.full_name.strip() if payload.full_name else user["full_name"]
        new_role = payload.role if payload.role else user["role"]
        
        if payload.qualifications is not None:
            new_quals = json.dumps(payload.qualifications)
        else:
            new_quals = user["qualifications"]
            
        new_notes = payload.notes if payload.notes is not None else user["notes"]
        
        try:
            await c.execute("""
                UPDATE users 
                SET pin = ?, full_name = ?, role = ?, qualifications = ?, notes = ?
                WHERE id = ?
            """, (stored_pin_val, new_name, new_role, new_quals, new_notes, user_id))
            
            old_name = user["full_name"].strip() if user["full_name"] else ""
            if old_name and new_name and old_name != new_name:
                try:
                    await c.execute("UPDATE audit_schedules SET lead_auditor = ? WHERE lead_auditor = ?", (new_name, old_name))
                except Exception:
                    pass
                try:
                    await c.execute("UPDATE audits SET auditor = ? WHERE auditor = ?", (new_name, old_name))
                except Exception:
                    pass
                    
            await conn.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(status_code=400, detail="Błąd integralności: PIN musi być unikalny")
            
    return {"status": "OK", "message": "Zaktualizowano profil audytora"}

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, manager: dict = Depends(require_manager)):
    if user_id == 1:
        raise HTTPException(status_code=400, detail="Nie można usunąć głównego konta administratora/managera (ID=1)")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
        await conn.commit()
    return {"status": "OK"}

