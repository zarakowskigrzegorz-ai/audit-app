from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from database import get_db
from agent import (
    analyze_audit_risk,
    run_agent_turn,
    run_chat_turn,
    generate_pre_audit_briefing,
    get_agent_architecture_info,
)

router = APIRouter(tags=["AI Agent & SLM"])


class AgentChatModel(BaseModel):
    message: str
    user_name: Optional[str] = "Audytor"
    user_role: Optional[str] = "AUDITOR"
    line: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = []


@router.post("/api/agent/chat")
async def agent_chat(payload: AgentChatModel):
    target_line = payload.line or "Cały Zakład"
    messages = list(payload.history or [])
    if payload.message and (not messages or messages[-1].get("content") != payload.message):
        messages.append({"role": "user", "content": payload.message})

    reply = await run_chat_turn(
        messages=messages,
        line=target_line,
        context={
            "line": target_line,
            "notes": payload.message,
            "user": payload.user_name or "Audytor",
            "role": payload.user_role or "AUDITOR",
        },
    )
    return {
        "reply": reply,
        "agent": "CopilotRagAgent",
        "orchestrator": "Neuro-Symbolic Multi-Agent v2",
    }


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

