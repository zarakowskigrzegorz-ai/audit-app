import json
import secrets
import base64
import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from database import get_db

from security import verify_pin, hash_pin, create_access_token, log_security_event

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
async def auth_login(payload: PinLoginModel):
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

        # Awaryjny fallback dla standardowych PINów (Key User: 9999, Audytor: 0000)
        if not matched:
            if clean_pin == "9999" and (not expected or expected == "MANAGER"):
                for row in rows:
                    if row["role"] == "MANAGER":
                        matched = row
                        break
            elif clean_pin == "0000" and (not expected or expected == "AUDITOR"):
                for row in rows:
                    if "Grzegorz" in row["full_name"] or row["role"] == "AUDITOR":
                        matched = row
                        break

        if not matched:
            detail_msg = (
                "Nieprawidłowy kod PIN dla konta Key User (Kierownik Jakości)."
                if expected == "MANAGER"
                else "Nieprawidłowy kod PIN dla konta Audytora."
                if expected == "AUDITOR"
                else "Nieprawidłowy kod PIN."
            )
            raise HTTPException(status_code=401, detail=detail_msg)

        user_dict = dict(matched)
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

@router.post("/biometric/register-challenge")
def bio_reg_challenge(user_id: int = Query(...)):
    raw = secrets.token_bytes(32)
    b64 = base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')
    return {"challenge": b64}

@router.post("/biometric/register-verify")
async def bio_reg_verify(payload: BiometricRegisterVerifyModel):
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
        await c.execute("SELECT id, pin, full_name, role FROM users WHERE biometric_cred_id = ? AND is_active = 1", (payload.credential_id,))
        row = await c.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Nieprawidłowe poświadczenie biometryczne")
    return dict(row)

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
async def list_users(role: str = Query("MANAGER")):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, pin, full_name, role, qualifications FROM users WHERE is_active = 1")
        rows = await c.fetchall()
    out = []
    for r in rows:
        try:
            quals = json.loads(r["qualifications"]) if r["qualifications"] else []
        except (json.JSONDecodeError, TypeError):
            quals = ["HACCP", "GMP", "GHP"]

        out.append({
            "id": r["id"], 
            "pin": r["pin"], 
            "full_name": r["full_name"],
            "role": r["role"], 
            "qualifications": quals
        })
    return out

@router.post("/users")
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

class UserUpdateModel(BaseModel):
    pin: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    qualifications: Optional[List[str]] = None
    zones: Optional[List[str]] = None
    notes: Optional[str] = None

@router.put("/users/{user_id}")
async def update_user(user_id: int, payload: UserUpdateModel, role: Optional[str] = Query(None)):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, pin, full_name, role, qualifications, notes FROM users WHERE id = ?", (user_id,))
        user = await c.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Użytkownik nie istnieje")
        
        new_pin = payload.pin.strip() if payload.pin else str(user["pin"]).strip()
        if not new_pin or len(new_pin) < 3:
            raise HTTPException(status_code=400, detail="Kod PIN musi zawierać co najmniej 3 znaki")
            
        await c.execute("SELECT id FROM users WHERE pin = ? AND id != ? AND is_active = 1", (new_pin, user_id))
        duplicate = await c.fetchone()
        if duplicate:
            raise HTTPException(status_code=400, detail="Ten kod PIN jest już przypisany do innego użytkownika")
            
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
            """, (new_pin, new_name, new_role, new_quals, new_notes, user_id))
            
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
async def delete_user(user_id: int, role: str = Query("MANAGER")):
    if role != "MANAGER": raise HTTPException(status_code=403, detail="Brak uprawnień")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("UPDATE users SET is_active = 0 WHERE id = ? AND pin != '9999'", (user_id,))
        await conn.commit()
    return {"status": "OK"}

