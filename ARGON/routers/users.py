import json
import aiosqlite
from fastapi import APIRouter, HTTPException, Query, Depends, Request, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from database import get_db
from security import (
    hash_pin,
    verify_pin,
    get_current_user,
    require_manager,
    log_security_event
)

router = APIRouter(tags=["Users"])

class UserCreateModel(BaseModel):
    pin: str
    full_name: str
    role: str = "AUDITOR"
    qualifications: List[str] = ["HACCP", "GMP", "GHP"]
    notes: Optional[str] = ""

class UserUpdateModel(BaseModel):
    pin: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    qualifications: Optional[List[str]] = None
    zones: Optional[List[str]] = None
    notes: Optional[str] = None

@router.get("/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    """Pobiera listę użytkowników. Wymaga uwierzytelnienia (ISO 27001 A.5.15)."""
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, full_name, role, qualifications, notes FROM users WHERE is_active = 1")
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
            "qualifications": quals,
            "notes": r["notes"] or ""
        })
    return out

@router.post("/users")
async def add_user(
    payload: UserCreateModel,
    request: Request,
    manager: dict = Depends(require_manager)
):
    """Tworzy nowego użytkownika z kryptograficznie solonym PIN (ISO 27001 A.8.24)."""
    clean_pin = payload.pin.strip()
    clean_name = payload.full_name.strip()
    if len(clean_pin) < 3:
        raise HTTPException(status_code=400, detail="Kod PIN musi zawierać co najmniej 3 znaki")
    if not clean_name:
        raise HTTPException(status_code=400, detail="Wprowadź imię i nazwisko użytkownika")

    # Haszowanie PIN przed zapisem do bazy
    hashed_pin = hash_pin(clean_pin)

    async with get_db() as conn:
        c = await conn.cursor()
        # Sprawdź czy PIN nie koliduje z istniejącym użytkownikiem
        await c.execute("SELECT id, pin FROM users WHERE is_active = 1")
        all_users = await c.fetchall()
        for u in all_users:
            if verify_pin(clean_pin, u["pin"]):
                raise HTTPException(status_code=400, detail="Ten kod PIN jest już zajęty przez innego użytkownika")

        try:
            await c.execute("""
                INSERT INTO users (pin, full_name, role, qualifications, notes, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            """, (hashed_pin, clean_name, payload.role, json.dumps(payload.qualifications), payload.notes or ""))
            new_id = c.lastrowid
            await conn.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(status_code=400, detail="Błąd zapisu: użytkownik z tymi danymi już istnieje")
        
    client_ip = request.client.host if request.client else "127.0.0.1"
    await log_security_event(
        event_type="USER_CREATED",
        user_id=manager["uid"],
        user_name=manager["sub"],
        ip_address=client_ip,
        severity="INFO",
        details=f"Utworzono konto użytkownika: {clean_name} (Rola: {payload.role})"
    )
    return {"status": "OK", "id": new_id}

@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    payload: UserUpdateModel,
    request: Request,
    manager: dict = Depends(require_manager)
):
    """Aktualizuje profil pracownika. Wymaga uprawnień Managera (ISO 27001 A.5.18)."""
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, pin, full_name, role, qualifications, notes FROM users WHERE id = ?", (user_id,))
        user = await c.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Użytkownik nie istnieje")
        
        # Obsługa zmiany PIN z haszowaniem
        if payload.pin and payload.pin.strip():
            new_pin_clean = payload.pin.strip()
            if len(new_pin_clean) < 3:
                raise HTTPException(status_code=400, detail="Kod PIN musi zawierać co najmniej 3 znaki")
            
            # Sprawdź unikalność
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
                    await c.execute("UPDATE audits SET auditor_id = ? WHERE auditor_id = ?", (new_name, old_name))
                except Exception:
                    pass
                    
            await conn.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(status_code=400, detail="Błąd integralności danych użytkownika")
            
    client_ip = request.client.host if request.client else "127.0.0.1"
    await log_security_event(
        event_type="USER_UPDATED",
        user_id=manager["uid"],
        user_name=manager["sub"],
        ip_address=client_ip,
        severity="INFO",
        details=f"Zaktualizowano profil użytkownika ID={user_id} ({new_name})"
    )
    return {"status": "OK", "message": "Zaktualizowano profil audytora"}

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    request: Request,
    manager: dict = Depends(require_manager)
):
    """Dezaktywuje konto użytkownika (ISO 27001 A.5.18)."""
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, full_name, pin FROM users WHERE id = ?", (user_id,))
        target_user = await c.fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail="Użytkownik nie znaleziony")

        # Zabezpieczenie konta głównego Managera (ID=1)
        if target_user["id"] == 1:
            raise HTTPException(status_code=400, detail="Nie można usunąć głównego konta Administratora Jakości")

        await c.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
        await conn.commit()
    
    client_ip = request.client.host if request.client else "127.0.0.1"
    await log_security_event(
        event_type="USER_DELETED",
        user_id=manager["uid"],
        user_name=manager["sub"],
        ip_address=client_ip,
        severity="WARN",
        details=f"Dezaktywowano konto użytkownika ID={user_id} ({target_user['full_name']})"
    )
    return {"status": "OK"}

