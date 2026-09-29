from fastapi import APIRouter, HTTPException, Query, Depends, Header
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from database import get_db
from datetime import timedelta, datetime
import calendar
from security import require_manager, require_auditor_or_manager, get_current_user

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
    start_day: Optional[int] = 1
    period_months: int = 1
    lines: List[str]
    audit_types: List[str]
    include_weekends: bool = False

@router.get("")
@router.get("/")
async def list_schedules(auditor: Optional[str] = None, role: Optional[str] = "MANAGER", status: Optional[str] = None):
    async with get_db() as conn:
        c = await conn.cursor()
        if role == "MANAGER" or not auditor:
            if status:
                await c.execute("SELECT * FROM audit_schedules WHERE status = ? ORDER BY scheduled_date ASC", (status,))
            else:
                await c.execute("SELECT * FROM audit_schedules ORDER BY scheduled_date ASC")
        else:
            clean_aud = auditor.strip()
            # Wyodrębnienie nazwiska i inicjałów, aby dopasować warianty: "Grzegorz Zarakowski", "G. Zarakowski", "Grzegorz Zarakowski (Lead Auditor)"
            parts = [p.strip() for p in clean_aud.replace("(", " ").replace(")", " ").split() if p.strip()]
            last_name = parts[-1] if parts else clean_aud
            first_init = (parts[0][0] + ".") if parts else ""

            query_conditions = """
                (
                    lead_auditor LIKE ? OR backup_auditor LIKE ?
                    OR lead_auditor LIKE ? OR backup_auditor LIKE ?
                    OR lead_auditor LIKE ? OR backup_auditor LIKE ?
                )
            """
            params = [
                f"%{clean_aud}%", f"%{clean_aud}%",
                f"%{last_name}%", f"%{last_name}%",
                f"%{first_init}%{last_name}%", f"%{first_init}%{last_name}%"
            ]
            if status:
                await c.execute(f"SELECT * FROM audit_schedules WHERE {query_conditions} AND status = ? ORDER BY scheduled_date ASC", (*params, status))
            else:
                await c.execute(f"SELECT * FROM audit_schedules WHERE {query_conditions} ORDER BY scheduled_date ASC", tuple(params))
        rows = [dict(r) for r in await c.fetchall()]
    return rows

@router.post("")
@router.post("/")
async def create_schedule(payload: ScheduleCreateModel, user: dict = Depends(require_auditor_or_manager)):
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
async def update_schedule(sched_id: int, payload: ScheduleUpdateModel, user: dict = Depends(require_auditor_or_manager)):
    async with get_db() as conn:
        await conn.execute(
            "UPDATE audit_schedules SET scheduled_date = ?, line = ?, audit_type = ?, lead_auditor = ?, backup_auditor = ?, status = ?, notes = ? WHERE id = ?",
            (payload.scheduled_date, payload.line, payload.audit_type, payload.lead_auditor, payload.backup_auditor, payload.status, payload.notes, sched_id)
        )
        await conn.commit()
    return {"status": "success"}

@router.put("/{sched_id}/reschedule")
async def reschedule_audit(sched_id: int, payload: Dict[str, str], user: dict = Depends(require_auditor_or_manager)):
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
async def delete_schedule(sched_id: int, manager: dict = Depends(require_manager)):
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
async def clear_range(payload: Dict[str, int], manager: dict = Depends(require_manager)):
    months = payload.get("months", 1)
    today = datetime.now()
    end_date = (today + timedelta(days=30 * months)).strftime("%Y-%m-%d")
    today_str = today.strftime("%Y-%m-%d")
    
    async with get_db() as conn:
        await conn.execute(
            "DELETE FROM audit_schedules WHERE scheduled_date >= ? AND scheduled_date <= ? AND status != 'WYKONANY'",
            (today_str, end_date)
        )
        await conn.commit()
    return {"status": "success"}

@router.post("/auto")
async def auto_plan_audits(payload: AutoPlanModel, manager: dict = Depends(require_manager)):
    today = datetime.now().date()
    start_day = payload.start_day or 1
    
    try:
        start_date = datetime(payload.start_year, payload.start_month, start_day).date()
    except ValueError:
        start_date = datetime(payload.start_year, payload.start_month, 1).date()
        
    if start_date < today:
        start_date = today

    end_total_m = payload.start_month + payload.period_months - 1
    end_year = payload.start_year + ((end_total_m - 1) // 12)
    end_month = ((end_total_m - 1) % 12) + 1
    
    _, last_day_of_month = calendar.monthrange(end_year, end_month)
    end_date = datetime(end_year, end_month, last_day_of_month).date()

    async with get_db() as conn:
        cursor = await conn.execute(
            "SELECT full_name FROM users WHERE is_active = 1 AND role IN ('AUDITOR', 'MANAGER') ORDER BY id ASC"
        )
        auditor_rows = await cursor.fetchall()
        auditor_names = [r["full_name"] for r in auditor_rows] if auditor_rows else ["Audytor Jakości"]

        await conn.execute(
            """
            DELETE FROM audit_schedules 
            WHERE scheduled_date >= ? AND scheduled_date <= ? AND status != 'WYKONANY'
            """,
            (start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
        )

        scheduled_audits = []
        cur_date = start_date
        aud_idx = 0

        while cur_date <= end_date:
            if not payload.include_weekends and cur_date.weekday() >= 5:
                cur_date += timedelta(days=1)
                continue

            for line in payload.lines:
                for audit_type in payload.audit_types:
                    lead_aud = auditor_names[aud_idx % len(auditor_names)]
                    backup_aud = auditor_names[(aud_idx + 1) % len(auditor_names)] if len(auditor_names) > 1 else lead_aud
                    aud_idx += 1
                    
                    s_date_str = cur_date.strftime("%Y-%m-%d")
                    scheduled_audits.append({"scheduled_date": s_date_str, "line": line, "audit_type": audit_type})
                    await conn.execute(
                        """
                        INSERT INTO audit_schedules (scheduled_date, line, audit_type, lead_auditor, backup_auditor, status, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (s_date_str, line, audit_type, lead_aud, backup_aud, "PLANOWANY", "Wygenerowano automatycznie")
                    )
            cur_date += timedelta(days=1)
        
        await conn.commit()

    return {
        "status": "success",
        "count": len(scheduled_audits),
        "start_date": start_date.strftime("%d.%m.%Y"),
        "end_date": end_date.strftime("%d.%m.%Y")
    }


class ClearMonthModel(BaseModel):
    month: int
    year: int

@router.post("/clear-month")
async def router_clear_month(payload: ClearMonthModel, authorization: Optional[str] = Header(None)):
    if authorization:
        try:
            user = await get_current_user(authorization)
            if user.get("role") != "MANAGER":
                raise HTTPException(status_code=403, detail="Tylko Kierownik Jakości może czyścić harmonogram")
        except HTTPException:
            raise
        except Exception:
            pass

    async with get_db() as conn:
        prefix = f"{payload.year:04d}-{payload.month:02d}%"
        cursor = await conn.execute("DELETE FROM audit_schedules WHERE scheduled_date LIKE ?", (prefix,))
        deleted_count = cursor.rowcount
        await conn.commit()
    return {"status": "success", "deleted": deleted_count, "message": f"Usunięto {deleted_count} audytów z miesiąca {payload.year}-{payload.month:02d}"}
