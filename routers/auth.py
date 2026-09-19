import json
import secrets
import base64
import aiosqlite
from fastapi import APIRouter, HTTPException, Query, Request, status, Depends
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from database import get_db
from security import (
    verify_pin,
    create_access_token,
    check_rate_limit,
    record_login_failure,
    reset_login_failures,
    log_security_event,
    get_current_user
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class PinLoginModel(BaseModel):
    pin: str

class BiometricRegisterVerifyModel(BaseModel):
    user_id: int
    credential_id: str

class BiometricLoginVerifyModel(BaseModel):
    credential_id: str

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

@router.post("/login")
async def auth_login(payload: PinLoginModel, request: Request):
    client_ip = get_client_ip(request)
    check_rate_limit(client_ip)
    
    clean_pin = payload.pin.strip()
    if not clean_pin:
        record_login_failure(client_ip)
        raise HTTPException(status_code=400, detail="Wprowadź kod PIN")

    async with get_db() as conn:
        cursor = await conn.execute("SELECT id, pin, full_name, role FROM users WHERE is_active = 1")
        users = await cursor.fetchall()
        
        matched_user = None
        for u in users:
            stored_pin = u["pin"]
            if verify_pin(clean_pin, stored_pin):
                matched_user = dict(u)
                break
        
        if not matched_user:
            record_login_failure(client_ip)
            await log_security_event(
                event_type="LOGIN_FAILED",
                ip_address=client_ip,
                severity="WARN",
                details="Nieudana próba logowania kodem PIN"
            )
            raise HTTPException(status_code=401, detail="Nieprawidłowy kod PIN")
        
        reset_login_failures(client_ip)
        token = create_access_token(matched_user)
        
        await log_security_event(
            event_type="LOGIN_SUCCESS",
            user_id=matched_user["id"],
            user_name=matched_user["full_name"],
            ip_address=client_ip,
            severity="INFO",
            details="Logowanie kodem PIN zakończone sukcesem"
        )
        
        return {
            "id": matched_user["id"],
            "full_name": matched_user["full_name"],
            "role": matched_user["role"],
            "access_token": token,
            "token_type": "Bearer"
        }

@router.post("/biometric/register-challenge")
def bio_reg_challenge(user_id: int = Query(...)):
    raw = secrets.token_bytes(32)
    b64 = base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')
    return {"challenge": b64}

@router.post("/biometric/register-verify")
async def bio_reg_verify(payload: BiometricRegisterVerifyModel, request: Request):
    client_ip = get_client_ip(request)
    if not payload.credential_id or len(payload.credential_id.strip()) < 8:
        raise HTTPException(status_code=400, detail="Nieprawidłowy identyfikator biometryczny.")
    
    clean_cred = payload.credential_id.strip()
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, full_name FROM users WHERE id = ? AND is_active = 1", (payload.user_id,))
        user_row = await c.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="Użytkownik nie znaleziony.")
        
        await c.execute("UPDATE users SET biometric_cred_id = ? WHERE id = ?", (clean_cred, payload.user_id))
        await c.execute("DELETE FROM biometric_credentials WHERE user_id = ?", (payload.user_id,))
        import datetime
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        await c.execute(
            "INSERT INTO biometric_credentials (user_id, credential_id, public_key, created_at, device_name) VALUES (?, ?, ?, ?, ?)",
            (payload.user_id, clean_cred, "webauthn-attestation-none", now_str, "Platform Authenticator")
        )
        await conn.commit()
    
    await log_security_event(
        event_type="BIOMETRIC_REGISTERED",
        user_id=payload.user_id,
        user_name=user_row["full_name"],
        ip_address=client_ip,
        severity="INFO",
        details="Powiązano czytnik biometryczny WebAuthn z kontem"
    )
    return {"status": "OK"}

@router.get("/biometric/login-challenge")
def bio_login_challenge():
    raw = secrets.token_bytes(32)
    b64 = base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')
    return {"challenge": b64}

@router.post("/biometric/login-verify")
async def bio_login_verify(payload: BiometricLoginVerifyModel, request: Request):
    client_ip = get_client_ip(request)
    check_rate_limit(client_ip)

    if not payload.credential_id or len(payload.credential_id.strip()) < 8:
        record_login_failure(client_ip)
        raise HTTPException(status_code=401, detail="Nieprawidłowe poświadczenie biometryczne")
    
    clean_cred = payload.credential_id.strip()
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute(
            "SELECT id, pin, full_name, role FROM users WHERE biometric_cred_id = ? AND is_active = 1",
            (clean_cred,)
        )
        row = await c.fetchone()
    
    if not row:
        record_login_failure(client_ip)
        await log_security_event(
            event_type="LOGIN_FAILED",
            ip_address=client_ip,
            severity="WARN",
            details="Nieudane logowanie biometryczne (nierozpoznane urządzenie)"
        )
        raise HTTPException(status_code=401, detail="Nieprawidłowe poświadczenie biometryczne")
    
    reset_login_failures(client_ip)
    user_dict = dict(row)
    token = create_access_token(user_dict)
    
    await log_security_event(
        event_type="LOGIN_SUCCESS",
        user_id=user_dict["id"],
        user_name=user_dict["full_name"],
        ip_address=client_ip,
        severity="INFO",
        details="Logowanie biometryczne WebAuthn zakończone sukcesem"
    )
    
    return {
        "id": user_dict["id"],
        "full_name": user_dict["full_name"],
        "role": user_dict["role"],
        "access_token": token,
        "token_type": "Bearer"
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
