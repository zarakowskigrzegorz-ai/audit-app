import json
import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from database import get_db

router = APIRouter(tags=["Users"])

class UserCreateModel(BaseModel):
    pin: str
    full_name: str
    role: str = "AUDITOR"
    qualifications: List[str] = ["HACCP", "GMP", "GHP"]
    notes: Optional[str] = ""

@router.get("/users")
async def list_users(role: str = Query("MANAGER")):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id, pin, full_name, role, qualifications, notes FROM users WHERE is_active = 1")
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
            "qualifications": quals,
            "notes": r["notes"] or ""
        })
    return out

@router.post("/users")
async def add_user(payload: UserCreateModel, role: str = Query("MANAGER")):
    if role != "MANAGER": raise HTTPException(status_code=403, detail="Brak uprawnień")
    async with get_db() as conn:
        c = await conn.cursor()
        try:
            await c.execute("""
                INSERT INTO users (pin, full_name, role, qualifications, notes, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            """, (payload.pin.strip(), payload.full_name.strip(), payload.role, json.dumps(payload.qualifications), payload.notes))
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
