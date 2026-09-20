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

class NoteReplyModel(BaseModel):
    manager_response: str
    manager_name: Optional[str] = "Key User (Manager)"

@router.post("", response_model=dict)
async def create_auditor_note(note: NoteCreateModel):
    if not note.content or not note.content.strip():
        raise HTTPException(status_code=400, detail="Treść notatki nie może być pusta.")
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            INSERT INTO auditor_notes (
                timestamp, auditor_id, auditor_name, line_id, line_name, priority, content, is_read, direction, auditor_read_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'TO_MANAGER', 0)
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
async def get_auditor_notes(
    auditor: Optional[str] = None, 
    unread_only: bool = False, 
    limit: int = 50,
    mode: Optional[str] = None
):
    async with get_db() as conn:
        c = await conn.cursor()
        query = "SELECT * FROM auditor_notes WHERE 1=1"
        params = []
        
        if mode == "inbox":
            # Skrzynka odbiorcza audytora: odpowiedzi od Key Usera lub komunikaty do audytorów
            query += " AND ((manager_response IS NOT NULL AND TRIM(manager_response) != '') OR direction = 'TO_AUDITORS')"
            if auditor:
                query += " AND (auditor_name = ? OR direction = 'TO_AUDITORS')"
                params.append(auditor.strip())
        elif mode == "sent":
            # Wysłane przez audytora
            if auditor:
                query += " AND auditor_name = ?"
                params.append(auditor.strip())
        else:
            # Domyślny widok Key Usera
            if auditor:
                query += " AND auditor_name = ?"
                params.append(auditor.strip())
            if unread_only:
                query += " AND is_read = 0"

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        await c.execute(query, tuple(params))
        rows = await c.fetchall()
        return [dict(r) for r in rows]

@router.get("/counts")
async def get_notes_counts(auditor: Optional[str] = None):
    async with get_db() as conn:
        c = await conn.cursor()
        
        # Nieprzeczytane przez menedżera
        await c.execute("SELECT COUNT(*) FROM auditor_notes WHERE is_read = 0 AND direction = 'TO_MANAGER'")
        mgr_unread = (await c.fetchone())[0]

        # Nieprzeczytane odpowiedzi dla audytora
        aud_query = """
            SELECT COUNT(*) FROM auditor_notes 
            WHERE manager_response IS NOT NULL 
              AND TRIM(manager_response) != '' 
              AND auditor_read_response = 0
        """
        aud_params = []
        if auditor:
            aud_query += " AND (auditor_name = ? OR direction = 'TO_AUDITORS')"
            aud_params.append(auditor.strip())
        
        await c.execute(aud_query, tuple(aud_params))
        aud_unread = (await c.fetchone())[0]

    return {
        "manager_unread": mgr_unread,
        "auditor_unread": aud_unread
    }

@router.post("/{note_id}/reply")
async def reply_to_auditor_note(note_id: int, reply: NoteReplyModel):
    if not reply.manager_response or not reply.manager_response.strip():
        raise HTTPException(status_code=400, detail="Treść odpowiedzi nie może być pusta.")
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            UPDATE auditor_notes
            SET manager_response = ?,
                manager_response_at = ?,
                manager_name = ?,
                is_read = 1,
                read_at = COALESCE(read_at, ?),
                auditor_read_response = 0
            WHERE id = ?
        """, (reply.manager_response.strip(), now_str, reply.manager_name or "Key User (Manager)", now_str, note_id))
        await conn.commit()

        try:
            await c.execute("""
                INSERT INTO security_audit_logs (timestamp, event_type, user_name, severity, details)
                VALUES (?, 'AUDITOR_NOTE_REPLY', ?, 'INFO', ?)
            """, (
                now_str,
                reply.manager_name or "Key User",
                f"Odpowiedź na notatkę (id={note_id}): {reply.manager_response[:80]}"
            ))
            await conn.commit()
        except Exception:
            pass

    return {
        "status": "success",
        "message": "Odpowiedź została wysłana do skrzynki odbiorczej audytora.",
        "note_id": note_id,
        "manager_response_at": now_str
    }

@router.patch("/{note_id}/auditor-read")
async def mark_note_as_read_by_auditor(note_id: int):
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            UPDATE auditor_notes 
            SET auditor_read_response = 1
            WHERE id = ?
        """, (note_id,))
        await conn.commit()
    return {"status": "success", "note_id": note_id}

@router.post("/auditor-mark-all-read")
async def mark_all_as_read_by_auditor(auditor: Optional[str] = None):
    async with get_db() as conn:
        c = await conn.cursor()
        if auditor:
            await c.execute("""
                UPDATE auditor_notes 
                SET auditor_read_response = 1
                WHERE (auditor_name = ? OR direction = 'TO_AUDITORS')
                  AND auditor_read_response = 0
            """, (auditor.strip(),))
        else:
            await c.execute("""
                UPDATE auditor_notes 
                SET auditor_read_response = 1
                WHERE auditor_read_response = 0
            """)
        await conn.commit()
    return {"status": "success"}

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

@router.post("/mark-all-read")
async def mark_all_notes_as_read():
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("""
            UPDATE auditor_notes 
            SET is_read = 1, read_at = ?
            WHERE is_read = 0
        """, (now_str,))
        await conn.commit()
    return {"status": "success", "read_at": now_str}


