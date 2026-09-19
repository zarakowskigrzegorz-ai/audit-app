import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

from database import run_migrations

# Importy dedykowanych routerów
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.lines import router as lines_router
from routers.schedule import router as schedule_router
from routers.checklist import router as checklist_router
from routers.audits import router as audits_router
from routers.reports import router as reports_router
from routers.agent import router as agent_router
from routers.guidelines import router as guidelines_router

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_migrations()
    yield

app = FastAPI(title="Quality Audit Enterprise", lifespan=lifespan)

# Ograniczenie CORS zgodnie z ISO 27001 A.8.20 / A.8.22
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Serwowanie plików statycznych i uploadów
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Rejestracja wszystkich modułów aplikacji
app.include_router(auth_router)
app.include_router(users_router, prefix="/api")
app.include_router(lines_router)
app.include_router(schedule_router)
app.include_router(checklist_router)
app.include_router(audits_router)
app.include_router(reports_router)
app.include_router(agent_router)
app.include_router(guidelines_router)

@app.get("/", response_class=HTMLResponse)
def read_root(response: Response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    template_path = os.path.join(BASE_DIR, "templates", "index.html")
    root_path = os.path.join(BASE_DIR, "index.html")
    final_path = template_path if os.path.exists(template_path) else root_path
    with open(final_path, "r", encoding="utf-8") as f:
        return f.read()

