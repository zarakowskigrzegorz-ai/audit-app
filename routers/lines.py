from fastapi import APIRouter, HTTPException
from typing import Optional, List
from pydantic import BaseModel
from database import get_db

router = APIRouter(prefix="/api/lines", tags=["Production Lines"])

class LineCreateModel(BaseModel):
    name: str
    code: str
    default_zone: str

@router.get("/")
async def list_lines():
    async with get_db() as conn:
        cursor = await conn.execute("SELECT id, name, code, default_zone FROM production_lines WHERE is_active = 1 ORDER BY name ASC")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

@router.post("/")
async def create_line(payload: LineCreateModel):
    async with get_db() as conn:
        await conn.execute(
            "INSERT INTO production_lines (name, code, default_zone, is_active) VALUES (?, ?, ?, 1)",
            (payload.name, payload.code, payload.default_zone)
        )
        await conn.commit()
    return {"status": "success"}

@router.delete("/{line_id}")
async def delete_line(line_id: int):
    async with get_db() as conn:
        await conn.execute("UPDATE production_lines SET is_active = 0 WHERE id = ?", (line_id,))
        await conn.commit()
    return {"status": "success"}
