from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from database import get_db
from security import verify_access_token
from agent import (
    analyze_audit_risk,
    run_agent_turn,
    run_chat_turn,
    stream_chat_turn,
    generate_suggested_replies,
    generate_pre_audit_briefing,
    get_agent_architecture_info,
)

router = APIRouter(tags=["AI Agent & SLM"])


async def _get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    try:
        return verify_access_token(parts[1])
    except Exception:
        return None



class AgentChatModel(BaseModel):
    message: str
    user_name: Optional[str] = "Audytor"
    user_role: Optional[str] = None
    role: Optional[str] = None
    line: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = []


async def _fetch_live_plant_context(target_line: str = "Cały Zakład") -> Dict[str, Any]:
    """
    Pobiera na żywo z bazy SQLite kontekst operacyjny zakładu:
    - ostatnie 5 audytów z tabeli audits,
    - dzisiejsze niezgodności NOK / HOLD LOT,
    - niewykonane audyty z audit_schedules na dziś,
    - ostatnie wiadomości z auditor_notes.
    """
    today_str = datetime.now().strftime("%Y-%m-%d")
    recent_audits: List[Dict[str, Any]] = []
    today_nok_audits: List[Dict[str, Any]] = []
    pending_schedules: List[Dict[str, Any]] = []
    recent_notes: List[Dict[str, Any]] = []

    try:
        async with get_db() as conn:
            c = await conn.cursor()

            # 1. Ostatnie 5 audytów
            if target_line and target_line not in ("Cały Zakład", "Ogólna", "Wszystkie"):
                await c.execute(
                    """
                    SELECT id, line, shift, zone, audit_type, slm_verdict, risk_level, notes, timestamp
                    FROM audits
                    WHERE line LIKE ?
                    ORDER BY id DESC LIMIT 5
                    """,
                    (f"%{target_line.strip()}%",),
                )
            else:
                await c.execute(
                    """
                    SELECT id, line, shift, zone, audit_type, slm_verdict, risk_level, notes, timestamp
                    FROM audits
                    ORDER BY id DESC LIMIT 5
                    """
                )
            recent_audits = [dict(r) for r in await c.fetchall()]

            # 2. Dzisiejsze (oraz ostatnie aktywne) niezgodności NOK / HOLD LOT
            await c.execute(
                """
                SELECT id, line, shift, audit_type, slm_verdict, risk_level, notes, timestamp
                FROM audits
                WHERE (UPPER(slm_verdict) LIKE '%NOK%' OR UPPER(risk_level) LIKE '%HOLD%' OR ko_failed = 1)
                ORDER BY id DESC LIMIT 10
                """
            )
            today_nok_audits = [dict(r) for r in await c.fetchall()]

            # 3. Niewykonane audyty z audit_schedules na dziś (lub zaległe)
            await c.execute(
                """
                SELECT id, scheduled_date, audit_type, line, lead_auditor, status
                FROM audit_schedules
                WHERE status = 'PLANOWANY' AND scheduled_date <= ?
                ORDER BY scheduled_date ASC LIMIT 10
                """,
                (today_str,),
            )
            pending_schedules = [dict(r) for r in await c.fetchall()]

            # 4. Ostatnie wiadomości z auditor_notes
            await c.execute(
                """
                SELECT id, timestamp, auditor_name, line_name, priority, content, direction
                FROM auditor_notes
                ORDER BY id DESC LIMIT 5
                """
            )
            recent_notes = [dict(r) for r in await c.fetchall()]
    except Exception as e:
        print(f"[AGENT LIVE CONTEXT WARN] {e}")

    return {
        "recent_audits": recent_audits,
        "today_nok_audits": today_nok_audits,
        "pending_schedules": pending_schedules,
        "recent_notes": recent_notes,
    }


def _resolve_chat_role(payload: AgentChatModel, current_user: Optional[dict]) -> str:
    raw_role = (
        payload.role
        or payload.user_role
        or (current_user.get("role") if current_user else None)
        or "AUDITOR"
    )
    return "MANAGER" if str(raw_role).strip().upper() == "MANAGER" else "AUDITOR"


@router.post("/api/agent/chat")
async def agent_chat(
    payload: AgentChatModel,
    current_user: Optional[dict] = Depends(_get_optional_user),
):
    target_line = payload.line or "Cały Zakład"
    resolved_role = _resolve_chat_role(payload, current_user)
    live_context = await _fetch_live_plant_context(target_line)

    messages = list(payload.history or [])
    if payload.message and (not messages or messages[-1].get("content") != payload.message):
        messages.append({"role": "user", "content": payload.message})

    context = {
        "line": target_line,
        "notes": payload.message,
        "user": payload.user_name or (current_user.get("full_name") if current_user else "Audytor"),
        "role": resolved_role,
        "user_role": resolved_role,
        "live_context": live_context,
    }

    reply = await run_chat_turn(
        messages=messages,
        line=target_line,
        context=context,
    )
    suggested_replies = generate_suggested_replies(
        role=resolved_role,
        user_msg=payload.message,
        line=target_line,
        live_context=live_context,
    )

    return {
        "reply": reply,
        "role": resolved_role,
        "suggested_replies": suggested_replies,
        "agent": "CopilotRagAgent",
        "orchestrator": "Neuro-Symbolic Multi-Agent v2",
        "live_stats": {
            "recent_audits_count": len(live_context["recent_audits"]),
            "nok_hold_count": len(live_context["today_nok_audits"]),
            "pending_schedules_count": len(live_context["pending_schedules"]),
            "recent_notes_count": len(live_context["recent_notes"]),
        },
    }


@router.post("/api/agent/chat/stream")
async def agent_chat_stream(
    payload: AgentChatModel,
    current_user: Optional[dict] = Depends(_get_optional_user),
):
    target_line = payload.line or "Cały Zakład"
    resolved_role = _resolve_chat_role(payload, current_user)
    live_context = await _fetch_live_plant_context(target_line)

    messages = list(payload.history or [])
    if payload.message and (not messages or messages[-1].get("content") != payload.message):
        messages.append({"role": "user", "content": payload.message})

    context = {
        "line": target_line,
        "notes": payload.message,
        "user": payload.user_name or (current_user.get("full_name") if current_user else "Audytor"),
        "role": resolved_role,
        "user_role": resolved_role,
        "live_context": live_context,
    }

    return StreamingResponse(
        stream_chat_turn(messages=messages, line=target_line, context=context),
        media_type="text/event-stream",
    )


@router.get("/api/agent/briefing/{line_name}")
async def agent_line_briefing(line_name: str):
    briefing = await generate_pre_audit_briefing(line_name)
    return briefing


@router.post("/api/slm-analyze")
async def slm_analyze(payload: dict):
    res = await analyze_audit_risk(payload)
    return res


@router.get("/api/agent/architecture")
async def agent_architecture_diagnostics():
    return await get_agent_architecture_info()


