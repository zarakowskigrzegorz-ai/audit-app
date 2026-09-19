import sqlite3
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_db
from security import require_manager

router = APIRouter(tags=["Checklist Guidelines"])

class GuidelineUpdate(BaseModel):
    title: Optional[str] = None
    question: Optional[str] = None
    ifs_clause: Optional[str] = None
    criteria: Optional[str] = None
    correct_action: Optional[str] = None
    deviation_action: Optional[str] = None
    risk_level: Optional[str] = None

@router.get("/api/checklist/guidelines")
async def get_checklist_guidelines():
    async with get_db() as conn:
        cur = await conn.cursor()
        await cur.execute("""
            SELECT id, category, category_label, title, question, 
                   ifs_clause, criteria, correct_action, deviation_action, 
                   risk_level, updated_at
            FROM checklist_guidelines
            ORDER BY 
                CASE category 
                    WHEN 'CCP' THEN 1 
                    WHEN 'GMP' THEN 2 
                    WHEN 'FOREIGN_MATTER' THEN 3 
                    ELSE 4 
                END, id
        """)
        rows = await cur.fetchall()
        return [dict(r) for r in rows]

@router.put("/api/checklist/guidelines/{guideline_id}")
async def update_checklist_guideline(
    guideline_id: str,
    data: GuidelineUpdate,
    manager: dict = Depends(require_manager)
):
    ALLOWED_GUIDELINE_FIELDS = {
        "title", "question", "ifs_clause", "criteria",
        "correct_action", "deviation_action", "risk_level"
    }
    
    async with get_db() as conn:
        c = await conn.cursor()
        await c.execute("SELECT id FROM checklist_guidelines WHERE id = ?", (guideline_id,))
        if not await c.fetchone():
            raise HTTPException(status_code=404, detail="Wytyczna nie istnieje")

        fields = []
        values = []
        for k, v in data.dict(exclude_unset=True).items():
            if k in ALLOWED_GUIDELINE_FIELDS:
                fields.append(f"{k} = ?")
                values.append(v)

        if not fields:
            return {"status": "no_changes"}

        fields.append("updated_at = datetime('now', 'localtime')")
        values.append(guideline_id)
        query = f"UPDATE checklist_guidelines SET {', '.join(fields)} WHERE id = ?"
        await c.execute(query, tuple(values))
        await conn.commit()
        
    return {"status": "ok", "updated_id": guideline_id}
