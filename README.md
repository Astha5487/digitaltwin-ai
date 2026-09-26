# DIGITALTWIN.AI

**DIGITALTWIN.AI** is an agentic decision twin for mixed-model vehicle assembly lines.

It monitors production conditions, detects emerging bottlenecks and defect risks, investigates causes using available evidence, simulates corrective actions, and learns by comparing predicted outcomes with reality.

> **When confidence is low, the system does not guess. It asks for evidence.**

### Decision Loop

**Detect → Investigate → Understand → Rehearse → Decide → Learn**

---

## Run It

### Windows

```bash
run.bat
```

### macOS / Linux

```bash
./run.sh
```

Open:

```text
http://localhost:5173
```

### Manual Setup

**Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate       # Windows
source .venv/bin/activate    # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

API docs:

```text
http://localhost:8000/docs
```

---

## How It Works

### 1. Monitor

A live Digital Twin represents the factory state across:

* Body Shop
* Paint
* Final Assembly
* Quality
* 42 assembly stations

It tracks cycle time, queue, throughput, defect risk and bottleneck risk.

### 2. Investigate

For low-coverage stations, the twin combines:

* Sensors
* Computer vision
* Neighbouring stations
* Historical data
* Maintenance records
* Operator input

### 3. Evidence Before Recommendation

If confidence is below **70%**, the system does not recommend an action.

It requests additional evidence and updates confidence before causal reasoning.

Example:

```text
54% → 70% → 84% → 94%
```

### 4. Reason

The Root Cause Agent connects evidence to possible causes.

The prototype distinguishes root causes from symptoms and treats operator activity as process evidence rather than automatically assigning blame.

### 5. Rehearse

The Simulation Agent compares:

```text
Do Nothing
Adjust
Repair
Wait
```

The user can see predicted effects on risk, queue, throughput and downtime before deciding.

### 6. Decide & Learn

The human can:

```text
Approve / Modify / Reject
```

The system then compares predicted and actual outcomes and records the human verdict.

---

## Roles and Access

Three roles, in order of authority: **Floor Manager → Factory Manager → Leadership**.

| Area | Floor Manager | Factory Manager | Leadership |
| --- | --- | --- | --- |
| Overview, station search, 3D plant, data, assistant | ✓ | ✓ | ✓ |
| Lines and incident workflow (investigate, root cause, decide) | ✓ | ✓ | — |
| Outcome | ✓ | ✓ | ✓ (view) |
| Plant performance | Locked | ✓ | ✓ |
| Edit or delete plant documents | Locked | ✓ | ✓ |
| Portfolio and business case | Locked | Locked | ✓ |
| Access control | Locked | ✓ | ✓ |

Locked areas can be granted to a lower role only by someone with more authority, and only for
features the grantor holds by right. Access control itself can't be granted. Every check runs on
the backend (`backend/app/access.py`), so the browser can't unlock anything on its own.
Grants and sign-ins are kept in memory and reset when the backend restarts.

---

# Agentic Architecture

```text
Existing Factory Data
        ↓
   Digital Twin
        ↓
    Physical AI
        ↓
NVIDIA NeMo Agent Toolkit
        ↓
Monitoring → Evidence → Root Cause
        → Simulation → Decision → Learning
        ↓
   Human Decision
```

**Digital Twin = shared factory state**
**NVIDIA NAT = agentic orchestrator**
**Human = final decision**

---

# Technology

### Frontend

React · Vite · Three.js · Framer Motion

### Backend

FastAPI · WebSockets · Python

### AI / NVIDIA

NVIDIA NeMo Agent Toolkit · Agentic workflows

### Simulation

Server-side causal simulation with:

* 60-second takt time
* 68 stations across 4 lines
* 24×6 operating schedule
* 18:00 maintenance window

---

# Key Design Principles

**Evidence before recommendation**
Low confidence triggers evidence collection instead of guessing.

**Root cause vs. symptom**
Immediate KPI recovery is separated from underlying maintenance needs.

**Measured vs. inferred**
Limited sensor coverage is explicitly represented rather than hidden.

**Human-in-the-loop**
AI investigates and simulates; the human approves the action.

**Predict → Compare → Learn**
Predicted outcomes are compared with actual results to create feedback.

---

# Prototype Scope

* All production data is simulated.
* No real PLCs, cameras or plant historian are connected.
* The Digital Twin is read-only.
* No PLC or industrial-control writes are performed.
* Operational actions require human approval.
* Numerical values are illustrative.
* The learning layer records feedback but does not retrain an ML model.

---

## Core Idea

> **The factory already generates the signals.
> DIGITALTWIN.AI connects the clues.**

**SEE → UNDERSTAND → INVESTIGATE → REHEARSE → DECIDE → LEARN**
