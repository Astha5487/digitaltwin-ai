"""DIGITALTWIN.AI - conversational agent.

Wraps an OpenAI chat model in a tool-calling loop. The "tools" are just thin
wrappers around functions that already exist in state.py / main.py, so the
model can both *read* the twin (snapshot, evidence, causes, scenarios,
documents) and, if you want it to, *act* on it (collect evidence, approve or
reject a scenario). Nothing here talks to a real plant - it's calling the
exact same in-memory simulation the REST API uses.

Set OPENAI_API_KEY in the environment (or a .env file loaded by main.py) to
enable this. If it's not set, /api/agent/chat returns a clear 503 instead of
crashing, so the rest of the app still works without it.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from .state import DOC_CATEGORIES, THRESHOLD, documents, twin

try:
    from openai import AsyncOpenAI
except ImportError:  # library not installed yet
    AsyncOpenAI = None  # type: ignore

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
API_KEY = os.environ.get("OPENAI_API_KEY")
BASE_URL = os.environ.get("OPENAI_BASE_URL")   # set this to point at Gemini, Groq, etc.

if API_KEY:
    where = BASE_URL or "api.openai.com (default)"
    print(f"[agent] Using key ending in ...{API_KEY[-6:]} (length {len(API_KEY)}), "
          f"model={MODEL}, endpoint={where}")
else:
    print("[agent] No OPENAI_API_KEY found in environment — agent endpoint will return 503.")

_client = (AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL) if (AsyncOpenAI and API_KEY) else None)

SYSTEM_PROMPT = """You are the on-call assistant embedded in DIGITALTWIN.AI, \
a decision-twin dashboard for an assembly plant. Everything is simulated - \
you are not touching a real PLC or real plant equipment, and neither can the \
tools you're given.

You can see the twin's live state (which station is in focus, its evidence, \
causes, and rehearsal scenarios) and, when asked to, act on it - collecting \
evidence or recording a human's approve/reject decision on a scenario.

Rules:
- Call get_snapshot first if you don't already know the current phase/focus.
- The twin will not surface root causes until confidence is at or above the \
{threshold}% action threshold. If asked "why" before that, collect evidence \
first, or tell the person which evidence to collect and why.
- Never claim an action changed anything in the real world - only the \
simulated twin.
- Keep answers short and concrete: name the station, the number, the next \
step. This is a working tool, not a chat companion.
""".format(threshold=THRESHOLD)


# --------------------------------------------------------------------- tools
def _snapshot() -> Dict[str, Any]:
    return twin.snapshot()


def _evidence_options() -> Dict[str, Any]:
    return {
        "confidence": twin.confidence,
        "threshold": THRESHOLD,
        "ready": twin.ready,
        "taken": twin.evidence,
        "options": [{**e, "taken": e["id"] in twin.evidence} for e in twin.evidence_options()],
    }


def _collect_evidence(evidence_id: str) -> Dict[str, Any]:
    try:
        finding = twin.collect(evidence_id)
    except KeyError:
        return {"error": f"No such evidence source: {evidence_id}"}
    return {"finding": finding, "confidence": twin.confidence, "ready": twin.ready}


def _causes() -> Dict[str, Any]:
    if not twin.ready:
        return {"error": f"Confidence {twin.confidence}% is under the {THRESHOLD}% bar. "
                          "Collect more evidence before asking for causes."}
    return {"confidence": twin.confidence, "causes": twin.causes(), "focus": twin.focus_station()}


def _scenarios() -> Dict[str, Any]:
    if not twin.ready:
        return {"error": f"Confidence {twin.confidence}% is under the {THRESHOLD}% bar."}
    from .state import SCENARIOS
    m = twin.metrics()
    return {"risk_now": m["defect_risk"],
            "scenarios": [{**s, "risk_before": m["defect_risk"]} for s in SCENARIOS],
            "focus": twin.focus_station()}


def _decide(scenario_id: str, verdict: str) -> Dict[str, Any]:
    if verdict not in ("approved", "rejected"):
        return {"error": "verdict must be 'approved' or 'rejected'"}
    return twin.decide(scenario_id, verdict)


def _outcome() -> Dict[str, Any]:
    if twin.phase not in ("acting", "done"):
        return {"error": "Nothing has been actioned yet."}
    return twin.outcome()


def _list_documents() -> Dict[str, Any]:
    return {"documents": documents.list(), "categories": DOC_CATEGORIES}


TOOL_IMPL = {
    "get_snapshot": lambda **_: _snapshot(),
    "get_evidence_options": lambda **_: _evidence_options(),
    "collect_evidence": lambda evidence_id, **_: _collect_evidence(evidence_id),
    "get_causes": lambda **_: _causes(),
    "get_scenarios": lambda **_: _scenarios(),
    "make_decision": lambda scenario_id, verdict, **_: _decide(scenario_id, verdict),
    "get_outcome": lambda **_: _outcome(),
    "list_documents": lambda **_: _list_documents(),
}

TOOLS = [
    {"type": "function", "function": {
        "name": "get_snapshot",
        "description": "Get the full current state of the twin: phase, focus station, confidence, "
                        "metrics, lines, events, and totals.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_evidence_options",
        "description": "List the evidence sources available for the current incident, which have "
                        "already been collected, and current confidence.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "collect_evidence",
        "description": "Collect one evidence source for the current incident (raises confidence).",
        "parameters": {
            "type": "object",
            "properties": {"evidence_id": {
                "type": "string",
                "description": "One of: camera, maintenance, cycles, operator",
            }},
            "required": ["evidence_id"],
        },
    }},
    {"type": "function", "function": {
        "name": "get_causes",
        "description": "Get the ranked root-cause breakdown for the current incident. "
                        "Only available once confidence is at or above the action threshold.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_scenarios",
        "description": "Get the rehearsal scenarios (do nothing / adjust / repair / wait) with "
                        "their predicted risk, downtime and throughput impact.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "make_decision",
        "description": "Record a human decision on a rehearsed scenario. Only call this when the "
                        "person has clearly told you which scenario to approve or reject.",
        "parameters": {
            "type": "object",
            "properties": {
                "scenario_id": {"type": "string", "description": "One of: nothing, adjust, repair, wait"},
                "verdict": {"type": "string", "enum": ["approved", "rejected"]},
            },
            "required": ["scenario_id", "verdict"],
        },
    }},
    {"type": "function", "function": {
        "name": "get_outcome",
        "description": "Get the predicted-vs-actual outcome once a decision has been actioned.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "list_documents",
        "description": "List uploaded documents (manuals, production/downtime/quality/maintenance data).",
        "parameters": {"type": "object", "properties": {}},
    }},
]

MAX_TOOL_ROUNDS = 6


class AgentUnavailable(RuntimeError):
    pass


async def run_agent(message: str, history: List[Dict[str, str]] | None = None) -> Dict[str, Any]:
    """Runs one turn of the tool-calling loop and returns the reply plus a
    trace of which tools were called, so the UI can show its work."""
    if _client is None:
        raise AgentUnavailable(
            "OPENAI_API_KEY is not set (or the openai package isn't installed) on the backend."
        )

    messages: List[Dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in (history or [])[-20:]:                       # keep the payload bounded
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": message})

    trace: List[Dict[str, Any]] = []

    for _ in range(MAX_TOOL_ROUNDS):
        resp = await _client.chat.completions.create(
            model=MODEL, messages=messages, tools=TOOLS, tool_choice="auto",
        )
        choice = resp.choices[0].message

        if not choice.tool_calls:
            return {"reply": choice.content or "", "trace": trace}

        messages.append({
            "role": "assistant",
            "content": choice.content,
            "tool_calls": [tc.model_dump() for tc in choice.tool_calls],
        })

        for tc in choice.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            impl = TOOL_IMPL.get(name)
            try:
                result = impl(**args) if impl else {"error": f"Unknown tool: {name}"}
            except TypeError as e:
                result = {"error": f"Bad arguments for {name}: {e}"}
            except Exception as e:  # keep the loop alive; surface the error to the model
                result = {"error": str(e)}

            trace.append({"tool": name, "args": args, "result": result})
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, default=str),
            })

    return {"reply": "I'm going in circles on tool calls - try rephrasing the question.",
            "trace": trace}
