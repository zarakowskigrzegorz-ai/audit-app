import json
import secrets
import base64
import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class PinLoginModel(BaseModel):
    pin: str

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
async def auth_login(payload: PinLoginModel):
    async with get_db() as conn:
        async with conn.execute("SELECT id, pin, full_name, role FROM users WHERE pin = ? AND is_active = 1", (payload.pin.strip(),)) as cursor:
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(status_code=401, detail="Nieprawidłowy kod PIN")
            return dict(row)

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

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, role: str = Query("MANAGER")):
    if role != "MANAGER": raise HTTPException(status_code=403, detail="Brak uprawnień")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("UPDATE users SET is_active = 0 WHERE id = ? AND pin != '9999'", (user_id,))
        await conn.commit()
    return {"status": "OK"}
