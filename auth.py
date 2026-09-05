import os
import aiosqlite
from typing import Optional, Dict, List
from datetime import datetime

from fastapi import HTTPException

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(BASE_DIR, "audits.db")

async def get_db_connection():
    conn = await aiosqlite.connect(DB_NAME)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL;")
    return conn

async def authenticate_user(pin: str) -> Optional[Dict]:
    if not pin:
        raise HTTPException(status_code=401, detail="Nieprawidłowy PIN lub login")
    async with await get_db_connection() as conn:
        async with conn.execute(
            "SELECT id, pin, full_name, role, qualifications, department, is_active FROM users WHERE pin = ? AND is_active = 1", 
            (pin.strip(),)
        ) as cursor:
            row = await cursor.fetchone()
            if row and str(row["pin"]).strip() == str(pin).strip() and row["is_active"] == 1:
                return {
                    "id": row["id"],
                    "pin": str(row["pin"]).strip(),
                    "username": row["full_name"].strip(),
                    "full_name": row["full_name"].strip(),
                    "role": row["role"].strip(),
                    "department": row["department"].strip() if row["department"] else "General",
                    "qualifications": [q.strip() for q in (row["qualifications"] or "HACCP,GMP,GHP").split(",") if q.strip()]
                }
    raise HTTPException(status_code=401, detail="Nieprawidłowy PIN lub login")

async def get_all_auditors(required_type: Optional[str] = None) -> List[str]:
    async with await get_db_connection() as conn:
        async with conn.execute("SELECT full_name, qualifications FROM users WHERE role = 'AUDITOR' AND is_active = 1") as cursor:
            rows = await cursor.fetchall()
            if not required_type:
                return [r["full_name"].strip() for r in rows]
            matching = []
            for r in rows:
                qual_list = [q.strip().upper() for q in (r["qualifications"] or "").split(",")]
                if required_type.upper() in qual_list:
                    matching.append(r["full_name"].strip())
            return matching

async def add_new_user(pin: str, full_name: str, role: str = "AUDITOR", qualifications: str = "HACCP,GMP,GHP", department: str = "Production") -> bool:
    try:
        async with await get_db_connection() as conn:
            await conn.execute(
                "INSERT INTO users (pin, full_name, role, qualifications, department, is_active) VALUES (?, ?, ?, ?, ?, 1)",
                (pin.strip(), full_name.strip(), role, qualifications.strip(), department.strip())
            )
            await conn.commit()
            return True
    except aiosqlite.IntegrityError:
        return False

async def authenticate_by_credential(credential_id: str) -> Optional[Dict]:
    if not credential_id:
        return None
    async with await get_db_connection() as conn:
        async with conn.execute("""
            SELECT u.id, u.pin, u.full_name, u.role, u.qualifications, u.department 
            FROM users u
            JOIN biometric_credentials b ON u.id = b.user_id
            WHERE b.credential_id = ? AND u.is_active = 1
        """, (credential_id.strip(),)) as cursor:
            row = await cursor.fetchone()
            if row:
                return {
                    "id": row["id"],
                    "pin": str(row["pin"]).strip(),
                    "username": row["full_name"].strip(),
                    "full_name": row["full_name"].strip(),
                    "role": row["role"].strip(),
                    "department": row["department"].strip() if row["department"] else "General",
                    "qualifications": [q.strip() for q in (row["qualifications"] or "HACCP,GMP,GHP").split(",") if q.strip()]
                }
    return None

async def register_biometric_credential(user_id: int, credential_id: str, device_name: str = "Biometria IFS") -> bool:
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        async with await get_db_connection() as conn:
            await conn.execute("""
                INSERT INTO biometric_credentials (user_id, credential_id, created_at, device_name)
                VALUES (?, ?, ?, ?)
            """, (user_id, credential_id.strip(), now_str, device_name.strip()))
            await conn.commit()
            return True
    except aiosqlite.IntegrityError:
        return False

async def get_all_users_detailed() -> List[Dict]:
    async with await get_db_connection() as conn:
        async with conn.execute("SELECT id, pin, full_name, role, qualifications, department, is_active FROM users ORDER BY role DESC, full_name ASC") as cursor:
            rows = await cursor.fetchall()
            return [{
                "id": r["id"],
                "pin": str(r["pin"]).strip(),
                "username": r["full_name"].strip(),
                "full_name": r["full_name"].strip(),
                "role": r["role"].strip(),
                "department": r["department"].strip() if r["department"] else "General",
                "qualifications": [q.strip() for q in (r["qualifications"] or "HACCP,GMP,GHP").split(",") if q.strip()],
                "is_active": r["is_active"]
            } for r in rows]

async def update_existing_user(user_id: int, pin: str, full_name: str, role: str, qualifications: str = "HACCP,GMP,GHP", department: str = "Production") -> bool:
    try:
        async with await get_db_connection() as conn:
            await conn.execute("""
                UPDATE users SET pin = ?, full_name = ?, role = ?, qualifications = ?, department = ?
                WHERE id = ?
            """, (pin.strip(), full_name.strip(), role, qualifications.strip(), department.strip(), user_id))
            await conn.commit()
            return True
    except aiosqlite.IntegrityError:
        return False

async def delete_existing_user(user_id: int) -> bool:
    async with await get_db_connection() as conn:
        await conn.execute("DELETE FROM users WHERE id = ? AND pin != '9999'", (user_id,))
        await conn.commit()
    return True