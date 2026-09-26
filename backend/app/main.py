"""DIGITALTWIN.AI API.

REST for actions, one WebSocket for the live stream.
Run:  uvicorn app.main:app --port 8000 --reload
"""
from __future__ import annotations

import asyncio
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

try:
    from dotenv import load_dotenv
    load_dotenv(override=True)   # .env always wins over a stale shell-exported var
except ImportError:
    pass

from .agent import AgentUnavailable, run_agent
try:
    # Optional: NVIDIA NeMo Agent Toolkit (pip install nvidia-nat). The rest of
    # the app works without it; only the /api/nat/* endpoints need it.
    from .nat_orchestrator import test_orchestrator, test_learning
except Exception as _nat_err:  # ImportError, or a version clash inside nvidia-nat
    print(f"[nat] NeMo Agent Toolkit failed to load ({type(_nat_err).__name__}: {_nat_err}) — /api/nat/* endpoints disabled.")

    async def test_orchestrator():
        raise RuntimeError("NeMo Agent Toolkit not installed: pip install nvidia-nat")

    async def test_learning():
        raise RuntimeError("NeMo Agent Toolkit not installed: pip install nvidia-nat")
from . import access
from .state import (BUSINESS, DOC_CATEGORIES, PERFORMANCE, ROLES, SCENARIOS, THRESHOLD,
                    documents, twin)

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

clients: set[asyncio.Queue] = set()


async def ticker() -> None:
    while True:
        await asyncio.sleep(0.5)
        twin.step()
        payload = twin.snapshot()
        for q in list(clients):
            if not q.full():
                q.put_nowait(payload)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(ticker())
    yield
    task.cancel()


app = FastAPI(title="DIGITALTWIN.AI", version="3.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Speed(BaseModel):
    running: bool | None = None
    speed: int | None = None


class Decision(BaseModel):
    scenario_id: str
    verdict: str          # approved | rejected


class Feedback(BaseModel):
    correct: bool


class Login(BaseModel):
    username: str
    password: str


class DocPatch(BaseModel):
    name: str | None = None
    category: str | None = None


class ChatTurn(BaseModel):
    role: str
    content: str


class Grant(BaseModel):
    role: str
    feature: str
    on: bool


class ChatMessage(BaseModel):
    message: str
    history: list[ChatTurn] = []


# ------------------------------------------------------------------------- auth
@app.post("/api/login")
def login(body: Login):
    entry = ROLES.get(body.username.strip().lower())
    if not entry or entry["password"] != body.password:
        raise HTTPException(401, "Wrong username or password")
    return {"ok": True, "role": entry["role"], "roleName": entry["name"], "displayName": entry["label"],
            "level": access.LEVEL[entry["role"]], "token": access.open_session(entry["role"])}


def _role(authorization: str | None) -> str:
    """The signed-in role behind a request, or 401."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    role = access.role_for(token)
    if not role:
        raise HTTPException(401, "Please sign in again.")
    return role


def _require(authorization: str | None, feature: str) -> str:
    role = _role(authorization)
    if not access.can(role, feature):
        need = access.FEATURES[feature]
        raise HTTPException(403, f"{need['name']} is restricted. Ask someone with more authority to grant access.")
    return role


@app.get("/api/access")
def get_access(authorization: str | None = Header(None)):
    return access.summary(_role(authorization))


@app.post("/api/access")
def post_access(body: Grant, authorization: str | None = Header(None)):
    role = _require(authorization, "access")
    try:
        access.set_grant(role, body.role, body.feature, body.on)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    twin.log(f"{access.ROLE_NAME[role]} {'granted' if body.on else 'removed'} "
             f"{access.FEATURES[body.feature]['name'].lower()} for {access.ROLE_NAME[body.role]}.", "info")
    return access.summary(role)


@app.get("/api/roles")
def roles():
    """Not secret in a prototype — lets the login screen show demo credentials."""
    return {"roles": [{"username": u, "password": r["password"], "roleName": r["name"],
                       "level": access.LEVEL[r["role"]]} for u, r in ROLES.items()]}


# ------------------------------------------------------------------------- twin
@app.get("/api/health")
def health():
    return {"ok": True, "simulated": True}


@app.get("/api/snapshot")
def snapshot():
    return twin.snapshot()


@app.get("/api/plants")
def plants(authorization: str | None = Header(None)):
    _require(authorization, "portfolio")
    return {"plants": twin.plants(), "business": BUSINESS,
            "downtime_change_pct": PERFORMANCE["downtime_change_pct"]}


@app.get("/api/performance")
def performance(authorization: str | None = Header(None)):
    _require(authorization, "performance")
    return PERFORMANCE


@app.get("/api/sources")
def sources():
    """What feeds the twin, for the DATA page."""
    return {"sources": [
        {"id": "production", "name": "Production counts", "detail": "Units in and out per station",
         "status": "live", "coverage": 100},
        {"id": "machine", "name": "Machine signals", "detail": "Cycle time from PLC tags",
         "status": "live", "coverage": 71},
        {"id": "downtime", "name": "Downtime logs", "detail": "Stop reasons and durations",
         "status": "live", "coverage": 100},
        {"id": "quality", "name": "Quality checks", "detail": "Inspection results at gates",
         "status": "live", "coverage": 100},
        {"id": "camera", "name": "Cameras", "detail": "Queue depth and process timing",
         "status": "live", "coverage": 64},
        {"id": "manual", "name": "Manual checklists", "detail": "Operator entries on paper stations",
         "status": "periodic", "coverage": 100},
        {"id": "maintenance", "name": "Maintenance records", "detail": "Service dates and parts",
         "status": "live", "coverage": 100},
    ], "note": "The twin only reads plant data. It never writes to equipment."}


@app.get("/api/evidence")
def evidence():
    return {
        "confidence": twin.confidence,
        "threshold": THRESHOLD,
        "ready": twin.ready,
        "taken": twin.evidence,
        "options": [{**e, "taken": e["id"] in twin.evidence} for e in twin.evidence_options()],
    }


@app.post("/api/evidence/{eid}")
def collect(eid: str):
    try:
        return {"finding": twin.collect(eid), "confidence": twin.confidence, "ready": twin.ready}
    except KeyError:
        raise HTTPException(404, "No such evidence source")


@app.get("/api/causes")
def causes():
    if not twin.ready:
        raise HTTPException(409, f"Confidence {twin.confidence}% is under the {THRESHOLD}% bar. "
                                 "Collect evidence first.")
    return {"confidence": twin.confidence, "causes": twin.causes(), "focus": twin.focus_station()}


@app.get("/api/scenarios")
def scenarios():
    if not twin.ready:
        raise HTTPException(409, f"Confidence {twin.confidence}% is under the {THRESHOLD}% bar.")
    m = twin.metrics()
    return {
        "risk_now": m["defect_risk"],
        "scenarios": [{**s, "risk_before": m["defect_risk"]} for s in SCENARIOS],
        "recommended": "adjust",
        "why": ["Biggest risk drop for zero downtime", "Reversible if the trend does not respond",
                "Buys the line safely to the 18:00 service window"],
        "timing": "Apply now, book service for the 18:00 maintenance window.",
        "shift_pattern": "24 h/day, 6 days/week, Sunday maintenance.",
        "focus": twin.focus_station(),
    }


@app.post("/api/decision")
async def decision(body: Decision):
    try:
        result = twin.decide(body.scenario_id, body.verdict)

        return {
            **result,
            "nat": {
                "agent": "decision",
                "status": "human_decision_recorded",
                "scenario_id": body.scenario_id,
                "verdict": body.verdict,
            },
        }
    except Exception as e:
        raise HTTPException(
            500,
            f"Decision error: {type(e).__name__}: {e}"
        )


@app.get("/api/outcome")
def outcome():
    if twin.phase not in ("acting", "done"):
        raise HTTPException(409, "Nothing has been actioned yet.")
    return twin.outcome()


@app.post("/api/feedback")
def feedback(body: Feedback):
    return twin.record_feedback(body.correct)


@app.post("/api/sim")
def sim(body: Speed):
    # Pausing the twin is no longer offered; only the playback speed can change.
    if body.speed is not None:
        twin.speed = max(1, min(5, body.speed))
    return {"running": twin.running, "speed": twin.speed}


@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    q: asyncio.Queue = asyncio.Queue(maxsize=3)
    clients.add(q)
    try:
        await sock.send_json(twin.snapshot())
        while True:
            await sock.send_json(await q.get())
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        clients.discard(q)


# ------------------------------------------------------------------------ agent
@app.post("/api/agent/chat")
async def agent_chat(body: ChatMessage):
    try:
        return await run_agent(body.message, [t.model_dump() for t in body.history])
    except AgentUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        # Surface the real reason (bad key, wrong model name, rate limit, etc.)
        # instead of a bare 500 with no detail.
        raise HTTPException(500, f"Agent error: {type(e).__name__}: {e}")

@app.get("/api/nat/orchestrate")
async def nat_orchestrate():
    try:
        return await test_orchestrator()
    except Exception as e:
        raise HTTPException(
            500,
            f"NAT orchestration error: {type(e).__name__}: {e}"
        )

@app.get("/api/nat/learn")
async def nat_learn():
    try:
        return await test_learning()
    except Exception as e:
        raise HTTPException(
            500,
            f"NAT learning error: {type(e).__name__}: {e}"
        )
# -------------------------------------------------------------------- documents
@app.get("/api/documents/categories")
def doc_categories():
    return {"categories": DOC_CATEGORIES}


@app.get("/api/documents")
def doc_list():
    return {"documents": documents.list(), "categories": DOC_CATEGORIES}


@app.post("/api/documents")
async def doc_upload(category: str = Form(...), uploaded_by: str = Form("Unknown"),
                      file: UploadFile = File(...)):
    if not any(c["id"] == category for c in DOC_CATEGORIES):
        raise HTTPException(400, "Unknown category")
    safe_name = Path(file.filename).name
    dest = UPLOAD_DIR / f"{category}_{int(asyncio.get_event_loop().time()*1000)}_{safe_name}"
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    size = dest.stat().st_size
    doc = documents.add(category, safe_name, size, str(dest), uploaded_by)
    twin.log(f"{uploaded_by} uploaded {safe_name} to {category}.", "good")
    return {"document": doc}


@app.patch("/api/documents/{doc_id}")
def doc_edit(doc_id: int, body: DocPatch, authorization: str | None = Header(None)):
    _require(authorization, "data_manage")
    doc = documents.update(doc_id, body.name, body.category)
    if not doc:
        raise HTTPException(404, "No such document")
    return {"document": doc}


@app.delete("/api/documents/{doc_id}")
def doc_delete(doc_id: int, authorization: str | None = Header(None)):
    _require(authorization, "data_manage")
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, "No such document")
    path = Path(doc["path"])
    if path.exists():
        path.unlink()
    documents.delete(doc_id)
    return {"ok": True}


@app.get("/api/documents/{doc_id}/file")
def doc_file(doc_id: int):
    doc = documents.get(doc_id)
    if not doc or not Path(doc["path"]).exists():
        raise HTTPException(404, "No such document")
    return FileResponse(doc["path"], filename=doc["name"])
