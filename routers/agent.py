from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any
from pydantic import BaseModel
from database import get_db
from agent import run_agent_turn

router = APIRouter(tags=["AI Agent & SLM"])

class AgentChatModel(BaseModel):
    message: str
    user_name: str
    user_role: str

@router.post("/api/agent/chat")
async def agent_chat(payload: AgentChatModel):
    reply = await run_agent_turn(
        audit_payload={"line": "Ogólna", "notes": payload.message, "user": payload.user_name, "role": payload.user_role},
        line_name="Ogólna"
    )
    return {"reply": reply}

@router.post("/api/slm-analyze")
async def slm_analyze(payload: Dict[str, Any]):
    # Logika analizy SLM
    return {"status": "OK"}
