from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from database import get_db
from agent import analyze_audit_risk, run_agent_turn, generate_pre_audit_briefing

router = APIRouter(tags=["AI Agent & SLM"])

class AgentChatModel(BaseModel):
    message: str
    user_name: str
    user_role: str
    line: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = []

@router.post("/api/agent/chat")
async def agent_chat(payload: AgentChatModel):
    target_line = payload.line or "Cały Zakład"
    reply = await run_agent_turn(
        audit_payload={
            "line": target_line, 
            "notes": payload.message, 
            "user": payload.user_name, 
            "role": payload.user_role,
            "history": payload.history or []
        },
        line_name=target_line,
        chat_history=payload.history or []
    )
    return {"reply": reply}

@router.get("/api/agent/briefing/{line_name}")
async def agent_line_briefing(line_name: str):
    briefing = await generate_pre_audit_briefing(line_name)
    return briefing

@router.post("/api/slm-analyze")
async def slm_analyze(payload: dict):
    res = await analyze_audit_risk(payload)
    return res
