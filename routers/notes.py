import os
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from database import get_db

router = APIRouter(prefix="/api/auditor-notes", tags=["Auditor Notes"])

class NoteCreateModel(BaseModel):
    auditor_id: Optional[int] = None
    auditor_name: str
    line_id: Optional[str] = ""
    line_name: Optional[str] = ""
    priority: Optional[str] = "INFO"  # INFO, WARNING, CRITICAL (HOLD)
    content: str

@router.post("", response_model=dict)
async def create_auditor_note(note: NoteCreateModel):
    if not note.content or not note.content.strip():
        raise HTTPException(status_code=400, detail="Treść notatki nie może być pusta.")
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            INSERT INTO auditor_notes (
                timestamp, auditor_id, auditor_name, line_id, line_name, priority, content, is_read
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            timestamp,
            note.auditor_id,
            note.auditor_name.strip(),
            note.line_id.strip() if note.line_id else "",
            note.line_name.strip() if note.line_name else "",
            note.priority or "INFO",
            note.content.strip()
        ))
        note_id = c.lastrowid
        await conn.commit()

        try:
            await c.execute("""
                INSERT INTO security_audit_logs (timestamp, event_type, user_name, severity, details)
                VALUES (?, 'AUDITOR_NOTE_SENT', ?, ?, ?)
            """, (
                timestamp,
                note.auditor_name,
                note.priority,
                f"Szybka notatka (id={note_id}) dla linii {note.line_name or 'Ogólna'}: {note.content[:80]}"
            ))
            await conn.commit()
        except Exception:
            pass

    return {
        "status": "success",
        "message": "Notatka została przekazana do Key Usera.",
        "note_id": note_id,
        "timestamp": timestamp
    }

@router.get("", response_model=List[dict])
async def get_auditor_notes(auditor: Optional[str] = None, unread_only: bool = False, limit: int = 50):
    async with get_db() as conn:
        c = await conn.cursor()
        query = "SELECT * FROM auditor_notes WHERE 1=1"
        params = []
        if auditor:
            query += " AND auditor_name = ?"
            params.append(auditor)
        if unread_only:
            query += " AND is_read = 0"
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        await c.execute(query, tuple(params))
        rows = await c.fetchall()
        return [dict(r) for r in rows]

@router.patch("/{note_id}/read")
async def mark_note_as_read(note_id: int):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            UPDATE auditor_notes 
            SET is_read = 1, read_at = ?
            WHERE id = ?
        """, (now_str, note_id))
        await conn.commit()
    return {"status": "success", "note_id": note_id, "read_at": now_str}
