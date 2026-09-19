import sqlite3
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from pydantic import BaseModel
from database import get_db
from security import require_manager, require_auditor_or_manager

router = APIRouter(prefix="/api/lines", tags=["Production Lines"])

class LineCreateModel(BaseModel):
    name: str
    code: Optional[str] = ""
    default_zone: str
    line_status: Optional[str] = "PRODUKCJA (Zwolniona)"
    allergen_profile: Optional[str] = "Dedykowana (Bez alergenów)"
    ccp_equipment: Optional[str] = "Detektor Metali, Sito"
    notes: Optional[str] = ""

class LineStatusUpdateModel(BaseModel):
    line_status: str
    notes: Optional[str] = None

def generate_backend_line_code(name: str) -> str:
    import re
    if not name or not name.strip():
        return "LIN-01"
    clean = name.strip()
    tr = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")
    clean = clean.translate(tr)
    num_match = re.search(r'(?:linia\s*|l\s*|#\s*)(\d+)', clean, re.IGNORECASE) or re.search(r'(\d+)', clean)
    line_num = num_match.group(1) if num_match else None
    
    stop_words = {'linia', 'line', 'i', 'w', 'na', 'oraz', 'z', 'do', 'dla', 'nr', 'the', 'and'}
    words = [w for w in re.sub(r'[^a-zA-Z0-9\s]', ' ', clean).split() if w.lower() not in stop_words]
    # Filtrujemy również słowa będące samym numerem linii lub l1/l2
    proc_words = [w for w in words if not w.isdigit() and not (line_num and w.lower() == f"l{line_num}".lower())]
    keyword = proc_words[0][:5].upper() if proc_words else ""
    
    if line_num and keyword:
        return f"L{line_num}-{keyword}"
    elif line_num:
        return f"LIN-{line_num}"
    elif words:
        return "LIN-" + "-".join([w[:4].upper() for w in words[:3]])
    return "LIN-01"

@router.get("")
@router.get("/")
async def list_lines():
    async with get_db() as conn:
        cursor = await conn.execute("""
            SELECT id, name, code, default_zone, line_status, allergen_profile, ccp_equipment, last_clearance_date, notes 
            FROM production_lines 
            WHERE is_active = 1 
            ORDER BY name ASC
        """)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

@router.get("/{line_id}")
async def get_line_passport(line_id: int):
    async with get_db() as conn:
        cursor = await conn.execute("""
            SELECT id, name, code, default_zone, line_status, allergen_profile, ccp_equipment, last_clearance_date, notes 
            FROM production_lines 
            WHERE id = ? AND is_active = 1
        """, (line_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Linia nie odnaleziona.")
        line_data = dict(row)
        
        # Pobierz historię ostatnich 5 audytów na tej linii
        c_audits = await conn.execute("""
            SELECT id, timestamp, auditor_id, shift, slm_verdict, total_score_pct, record_status 
            FROM audits 
            WHERE line = ? 
            ORDER BY id DESC LIMIT 5
        """, (line_data["name"],))
        line_data["recent_audits"] = [dict(r) for r in await c_audits.fetchall()]
        
        return line_data

@router.post("")
@router.post("/")
async def create_line(payload: LineCreateModel, current_user: dict = Depends(require_auditor_or_manager)):
    final_code = payload.code.strip() if payload.code and payload.code.strip() else generate_backend_line_code(payload.name)
    async with get_db() as conn:
        try:
            await conn.execute("""
                INSERT INTO production_lines 
                (name, code, default_zone, line_status, allergen_profile, ccp_equipment, notes, is_active) 
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """, (
                payload.name.strip(),
                final_code,
                payload.default_zone,
                payload.line_status or "PRODUKCJA (Zwolniona)",
                payload.allergen_profile or "Dedykowana (Bez alergenów)",
                payload.ccp_equipment or "Detektor Metali, Sito",
                payload.notes or ""
            ))
            await conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=400,
                detail="Linia o podanej nazwie lub kodzie już istnieje w systemie."
            )
    return {"status": "success"}

@router.patch("/{line_id}/status")
async def update_line_status(line_id: int, payload: LineStatusUpdateModel, current_user: dict = Depends(require_auditor_or_manager)):
    async with get_db() as conn:
        await conn.execute("""
            UPDATE production_lines 
            SET line_status = ?, notes = COALESCE(?, notes) 
            WHERE id = ?
        """, (payload.line_status, payload.notes, line_id))
        await conn.commit()
    return {"status": "success"}

@router.delete("/{line_id}")
async def delete_line(line_id: int, current_user: dict = Depends(require_auditor_or_manager)):
    async with get_db() as conn:
        await conn.execute("UPDATE production_lines SET is_active = 0 WHERE id = ?", (line_id,))
        await conn.commit()
    return {"status": "success"}
