from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from database import get_db
from datetime import timedelta, datetime
import calendar

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
    start_day: Optional[int] = None
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
        today = datetime.now().date()
        target_year = payload.start_year
        target_month = payload.start_month

        # Ustalenie start_date - brak planowania wstecz
        if (target_year, target_month) == (today.year, today.month):
            # Bieżący miesiąc: planowanie WYŁĄCZNIE od dzisiaj w przód (brak dat wstecznych)
            s_day = max(payload.start_day or today.day, today.day)
            start_date = datetime(target_year, target_month, s_day)
        elif (target_year, target_month) < (today.year, today.month):
            # Wybrano miesiąc przeszły: bezpieczne przestawienie na dzień bieżący
            start_date = datetime(today.year, today.month, today.day)
            target_year = today.year
            target_month = today.month
        else:
            # Miesiąc w przyszłości: start od 1. dnia tego miesiąca
            s_day = payload.start_day if payload.start_day else 1
            start_date = datetime(target_year, target_month, s_day)

        # Precyzyjne ustalenie end_date (ostatni dzień ostatniego objętego miesiąca)
        end_m_total = target_month + payload.period_months - 1
        end_yr = target_year + ((end_m_total - 1) // 12)
        end_mo = ((end_m_total - 1) % 12) + 1
        last_day = calendar.monthrange(end_yr, end_mo)[1]
        end_date = datetime(end_yr, end_mo, last_day)

        # Bezpieczne usuwanie TYLKO przyszłych planowanych audytów w wygenerowanym oknie dat
        await conn.execute("""
            DELETE FROM audit_schedules 
            WHERE status = 'PLANOWANY' 
              AND scheduled_date >= ? 
              AND scheduled_date <= ?
        """, (start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")))

        cursor = await conn.execute("SELECT full_name FROM users WHERE is_active = 1 AND role = 'AUDITOR'")
        rows = await cursor.fetchall()
        auditors = [r["full_name"] for r in rows]
        if len(auditors) < 2:
            auditors = ["Grzegorz Zarakowski (Lead Auditor)", "Piotr Kowalski (Audytor)", "Anna Nowak (Audytor)"]

        count = 0
        cur = start_date
        line_idx = type_idx = aud_idx = 0

        while cur <= end_date:
            if not payload.include_weekends and cur.weekday() in (5, 6):
                cur += timedelta(days=1)
                continue

            assigned_line = payload.lines[line_idx % len(payload.lines)]
            assigned_type = payload.audit_types[type_idx % len(payload.audit_types)]
            lead = auditors[aud_idx % len(auditors)]
            backup = auditors[(aud_idx + 1) % len(auditors)]
            
            await conn.execute("""
                INSERT INTO audit_schedules (scheduled_date, audit_type, line, lead_auditor, backup_auditor, status, notes)
                VALUES (?, ?, ?, ?, ?, 'PLANOWANY', 'Generacja AI (Optymalizacja IFS Food v8)')
            """, (cur.strftime("%Y-%m-%d"), assigned_type, assigned_line, lead, backup))

            count += 1
            line_idx += 1; type_idx += 1; aud_idx += 1
            cur += timedelta(days=3)

        await conn.commit()
    return {
        "status": "success",
        "count": count,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d")
    }


class ClearMonthModel(BaseModel):
    month: int
    year: int

@router.post("/clear-month")
async def router_clear_month(payload: ClearMonthModel):
    async with get_db() as conn:
        prefix = f"{payload.year:04d}-{payload.month:02d}%"
        await conn.execute("DELETE FROM audit_schedules WHERE scheduled_date LIKE ? AND status = 'PLANOWANY'", (prefix,))
        await conn.commit()
    return {"status": "success"}
