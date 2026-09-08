from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from database import get_db
from datetime import timedelta, datetime

router = APIRouter(prefix="/api/schedule", tags=["Schedule"])

class ScheduleCreateModel(BaseModel):
    scheduled_date: str
    audit_type: str
    line: str
    lead_auditor: str
    backup_auditor: str
    notes: Optional[str] = ""

class ScheduleUpdateModel(BaseModel):
    scheduled_date: str
    audit_type: str
    line: str
    lead_auditor: str
    backup_auditor: str
    status: str
    notes: Optional[str] = ""

class AutoPlanModel(BaseModel):
    start_year: int
    start_month: int
    period_months: int
    lines: List[str]
    audit_types: List[str]
    include_weekends: bool = False

@router.get("/")
async def list_schedules(status: Optional[str] = None):
    async with get_db() as conn:
        query = "SELECT id, scheduled_date, line, audit_type, lead_auditor, backup_auditor, status, notes, completed_at FROM audit_schedules"
        params = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY scheduled_date ASC"
        cursor = await conn.execute(query, tuple(params))
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

@router.post("/")
async def create_schedule(payload: ScheduleCreateModel):
    async with get_db() as conn:
        await conn.execute(
            "INSERT INTO audit_schedules (scheduled_date, line, audit_type, lead_auditor, backup_auditor, notes) VALUES (?, ?, ?, ?, ?, ?)",
            (payload.scheduled_date, payload.line, payload.audit_type, payload.lead_auditor, payload.backup_auditor, payload.notes)
        )
        await conn.commit()
    return {"status": "success"}

@router.get("/{sched_id}")
async def get_schedule(sched_id: int):
    async with get_db() as conn:
        cursor = await conn.execute("SELECT id, scheduled_date, line, audit_type, lead_auditor, backup_auditor, status, notes, completed_at FROM audit_schedules WHERE id = ?", (sched_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Harmonogram nie znaleziony")
        return dict(row)

@router.put("/{sched_id}")
async def update_schedule(sched_id: int, payload: ScheduleUpdateModel):
    async with get_db() as conn:
        await conn.execute(
            "UPDATE audit_schedules SET scheduled_date = ?, line = ?, audit_type = ?, lead_auditor = ?, backup_auditor = ?, status = ?, notes = ? WHERE id = ?",
            (payload.scheduled_date, payload.line, payload.audit_type, payload.lead_auditor, payload.backup_auditor, payload.status, payload.notes, sched_id)
        )
        await conn.commit()
    return {"status": "success"}

@router.put("/{sched_id}/reschedule")
async def reschedule_audit(sched_id: int, payload: Dict[str, str]):
    new_date = payload.get("new_date")
    if not new_date:
        raise HTTPException(status_code=400, detail="Brak daty")
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    if new_date < today_str:
        raise HTTPException(status_code=400, detail="Nie można przesuwać audytu na datę wsteczną")
        
    async with get_db() as conn:
        cursor = await conn.execute("SELECT scheduled_date FROM audit_schedules WHERE id = ?", (sched_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Harmonogram nie znaleziony")
            
        await conn.execute("UPDATE audit_schedules SET scheduled_date = ? WHERE id = ?", (new_date, sched_id))
        await conn.commit()
    return {"status": "success"}

@router.delete("/{sched_id}")
async def delete_schedule(sched_id: int):
    today_str = datetime.now().strftime("%Y-%m-%d")
    async with get_db() as conn:
        cursor = await conn.execute("SELECT scheduled_date, status FROM audit_schedules WHERE id = ?", (sched_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Harmonogram nie znaleziony")
        
        # Blokada usuwania historycznych
        if row["scheduled_date"] < today_str:
            raise HTTPException(status_code=400, detail="Nie można usunąć audytu z przeszłości")
            
        await conn.execute("DELETE FROM audit_schedules WHERE id = ?", (sched_id,))
        await conn.commit()
    return {"status": "success"}

@router.post("/clear-range")
async def clear_range(payload: Dict[str, int]):
    months = payload.get("months", 1)
    today = datetime.now()
    end_date = (today + timedelta(days=30 * months)).strftime("%Y-%m-%d")
    today_str = today.strftime("%Y-%m-%d")
    
    async with get_db() as conn:
        await conn.execute(
            "DELETE FROM audit_schedules WHERE scheduled_date >= ? AND scheduled_date <= ?",
            (today_str, end_date)
        )
        await conn.commit()
    return {"status": "success"}

@router.post("/auto")
async def auto_plan_audits(payload: AutoPlanModel):
    async with get_db() as conn:
        current_date = datetime(payload.start_year, payload.start_month, 1)
        end_date = current_date + timedelta(days=30 * payload.period_months) # Approx months

        # Usunięcie dotychczasowych planowanych audytów z wybranego okresu
        await conn.execute("""
            DELETE FROM audit_schedules 
            WHERE scheduled_date >= ? AND scheduled_date <= ? AND status = 'PLANOWANY'
        """, (current_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")))

        scheduled_audits = []
        while current_date < end_date:
            if not payload.include_weekends and current_date.weekday() >= 5: # Saturday or Sunday
                current_date += timedelta(days=1)
                continue

            for line in payload.lines:
                for audit_type in payload.audit_types:
                    # Simple assignment for now, could be enhanced with auditor availability
                    lead_auditor = "Grzegorz Zarakowski (Lead Auditor)"
                    backup_auditor = "Piotr Kowalski (Audytor)"

                    scheduled_audits.append({
                        "scheduled_date": current_date.strftime("%Y-%m-%d"),
                        "line": line,
                        "audit_type": audit_type,
                        "lead_auditor": lead_auditor,
                        "backup_auditor": backup_auditor,
                        "status": "PLANOWANY",
                        "notes": "Wygenerowano automatycznie"
                    })
                    await conn.execute(
                        "INSERT INTO audit_schedules (scheduled_date, line, audit_type, lead_auditor, backup_auditor, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (current_date.strftime("%Y-%m-%d"), line, audit_type, lead_auditor, backup_auditor, "PLANOWANY", "Wygenerowano automatycznie")
                    )
            current_date += timedelta(days=1)
        await conn.commit()
    return {"status": "success", "scheduled_audits_count": len(scheduled_audits)}
