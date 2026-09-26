"""DIGITALTWIN.AI - the whole simulation, kept deliberately small.

One latent variable (`wear`) drives everything. Two numbers describe a station:
cycle time and defect risk. Every line in the plant is modelled, so any of them
can be opened and inspected.

The twin is deliberately *not* pinned to one station or one root cause: every
time an incident resolves, a new station is picked (any line, any sensing
tier) and a new true cause is drawn, so the investigation is different each
time rather than always "Station 17, machine wear".
"""
from __future__ import annotations

import itertools
import math
import random
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

TAKT = 60          # target seconds per vehicle
THRESHOLD = 70     # below this confidence the twin will not recommend

# Sensing tiers. Coverage numbers are what the twin can physically measure.
FULL, SHADOW, MANUAL = "full", "shadow", "manual"
COVER = {FULL: 95, SHADOW: 20, MANUAL: 10}

LINE_DEFS = [
    {
        "id": "body", "name": "Body Shop", "prefix": "B",
        "names": ["Frame load", "Floor pan", "Side panel L", "Side panel R", "Roof set",
                  "Weld cell 1", "Weld cell 2", "Hem flange", "Door hang", "Bonnet fit",
                  "Boot fit", "Body scan"],
        "shadow": [7], "manual": [], "warning": [],
    },
    {
        "id": "paint", "name": "Paint", "prefix": "P",
        "names": ["Pre-treat", "E-coat", "Sealer", "Primer", "Base coat",
                  "Clear coat", "Bake oven", "Paint check"],
        "shadow": [3], "manual": [6], "warning": [5],
    },
    {
        "id": "final", "name": "Final Assembly", "prefix": "S",
        "names": ["Body drop", "Underbody", "Rear axle", "Front axle", "Brake lines",
                  "Exhaust", "Heat shield", "Harness", "Dashboard", "Steering",
                  "HVAC", "Windshield", "Rear glass", "Door trim L", "Door trim R",
                  "Seats", "Final torque", "Wheels", "Brake fill", "Coolant",
                  "Fuel fill", "Battery", "Bumper F", "Bumper R", "Headlamps",
                  "Door fit", "Roll test", "Water test", "Scan", "Sign-off",
                  "Badging", "Mirrors", "Wipers", "Carpet", "Console",
                  "Airbag", "Sunroof", "Spoiler", "Alignment", "Polish",
                  "Final scan", "Release"],
        "shadow": [4, 17, 21, 29, 35], "manual": [11, 26, 38], "warning": [4, 26],
    },
    {
        "id": "qc", "name": "Quality Check", "prefix": "Q",
        "names": ["Torque audit", "Leak test", "Brake test", "Light aim",
                  "Road test", "Final sign-off"],
        "shadow": [], "manual": [], "warning": [],
    },
]

# What each station does and which parts it touches, so people can search by
# process ("welding"), body part ("door") or component ("brake lines").
STATION_META = {
    # Body Shop
    "Frame load": ("Frame loading", ["Frame", "Chassis"]),
    "Floor pan": ("Spot welding", ["Floor pan", "Underbody"]),
    "Side panel L": ("Spot welding", ["Side panel", "Door frame"]),
    "Side panel R": ("Spot welding", ["Side panel", "Door frame"]),
    "Roof set": ("Laser welding", ["Roof"]),
    "Weld cell 1": ("Robotic spot welding", ["Body-in-white", "Door ring"]),
    "Weld cell 2": ("Robotic spot welding", ["Body-in-white", "Pillars"]),
    "Hem flange": ("Hemming", ["Doors", "Bonnet"]),
    "Door hang": ("Door hinge welding and hanging", ["Doors", "Hinges"]),
    "Bonnet fit": ("Panel fitting", ["Bonnet"]),
    "Boot fit": ("Panel fitting", ["Boot lid"]),
    "Body scan": ("Laser inspection", ["Body-in-white"]),
    # Paint
    "Pre-treat": ("Cleaning and phosphating", ["Body"]),
    "E-coat": ("Electro-coating", ["Body"]),
    "Sealer": ("Seam sealing", ["Seams", "Doors"]),
    "Primer": ("Priming", ["Body"]),
    "Base coat": ("Painting", ["Exterior panels"]),
    "Clear coat": ("Painting", ["Exterior panels"]),
    "Bake oven": ("Curing", ["Paint"]),
    "Paint check": ("Paint inspection", ["Paint finish"]),
    # Final Assembly
    "Body drop": ("Body and chassis marriage", ["Body", "Chassis"]),
    "Underbody": ("Fastening", ["Underbody"]),
    "Rear axle": ("Axle assembly", ["Rear axle", "Suspension"]),
    "Front axle": ("Axle assembly", ["Front axle", "Suspension"]),
    "Brake lines": ("Line routing", ["Brake lines"]),
    "Exhaust": ("Component fitting", ["Exhaust"]),
    "Heat shield": ("Fastening", ["Heat shield"]),
    "Harness": ("Wiring", ["Wiring harness"]),
    "Dashboard": ("Module installation", ["Dashboard", "Cockpit"]),
    "Steering": ("Component fitting", ["Steering column"]),
    "HVAC": ("Module installation", ["HVAC unit"]),
    "Windshield": ("Glass bonding", ["Windshield", "Glass"]),
    "Rear glass": ("Glass bonding", ["Rear glass", "Glass"]),
    "Door trim L": ("Trim fitting", ["Doors", "Door trim"]),
    "Door trim R": ("Trim fitting", ["Doors", "Door trim"]),
    "Seats": ("Seat installation", ["Seats"]),
    "Final torque": ("Torque tightening", ["Fasteners"]),
    "Wheels": ("Wheel mounting", ["Wheels", "Tyres"]),
    "Brake fill": ("Fluid filling", ["Brake fluid", "Brakes"]),
    "Coolant": ("Fluid filling", ["Coolant"]),
    "Fuel fill": ("Fluid filling", ["Fuel"]),
    "Battery": ("Electrical installation", ["Battery"]),
    "Bumper F": ("Component fitting", ["Front bumper"]),
    "Bumper R": ("Component fitting", ["Rear bumper"]),
    "Headlamps": ("Lamp fitting", ["Headlamps"]),
    "Door fit": ("Door alignment", ["Doors"]),
    "Roll test": ("Rolling road test", ["Drivetrain"]),
    "Water test": ("Leak testing", ["Seals", "Doors"]),
    "Scan": ("Electronic scan", ["ECUs"]),
    "Sign-off": ("Inspection", ["Vehicle"]),
    "Badging": ("Component fitting", ["Badges"]),
    "Mirrors": ("Component fitting", ["Mirrors", "Doors"]),
    "Wipers": ("Component fitting", ["Wipers"]),
    "Carpet": ("Trim fitting", ["Carpet"]),
    "Console": ("Module installation", ["Centre console"]),
    "Airbag": ("Safety system installation", ["Airbags"]),
    "Sunroof": ("Glass fitting", ["Sunroof", "Roof", "Glass"]),
    "Spoiler": ("Component fitting", ["Spoiler"]),
    "Alignment": ("Wheel alignment", ["Wheels", "Suspension"]),
    "Polish": ("Finishing", ["Paint finish"]),
    "Final scan": ("Electronic scan", ["ECUs"]),
    "Release": ("Vehicle release", ["Vehicle"]),
    # Quality Check
    "Torque audit": ("Torque audit", ["Fasteners"]),
    "Leak test": ("Leak testing", ["Seals", "Doors"]),
    "Brake test": ("Brake testing", ["Brakes"]),
    "Light aim": ("Lamp adjustment", ["Headlamps"]),
    "Road test": ("Road testing", ["Vehicle"]),
    "Final sign-off": ("Inspection", ["Vehicle"]),
}

# ----------------------------------------------------------------- root causes
# Four generic categories. Which one is *true* is redrawn every incident, so
# the same taxonomy applies no matter which station is in focus.
CAUSE_ORDER = ["machine", "part", "operator", "environment"]
CAUSE_WEIGHTS = [0.5, 0.2, 0.2, 0.1]          # machine wear is the common case, not the only one
CAUSE_PAIRS = [(44, 61), (26, 22), (19, 11), (11, 6)]   # (start%, end%) as confidence climbs

CAUSE_LIB = {
    "machine": {
        "name": "Machine wear",
        "for": lambda st: ["Cycle time climbing steadily", "Service interval overdue by 11 days",
                            "Matches a wear pattern seen earlier this shift",
                            f"Only {st['code']} is affected"],
        "against": ["Maintenance record shows service on schedule",
                    "Cycle time flat against baseline"],
    },
    "part": {
        "name": "Part quality",
        "for": lambda st: ["Incoming batch flagged by the quality gate",
                            "Defect pattern matches this part lot",
                            f"Only lots feeding {st['code']} show the pattern"],
        "against": ["Incoming quality checks normal", "Same batch running fine elsewhere",
                    "Problem is time-linked, not batch-linked"],
    },
    "operator": {
        "name": "Operator / process",
        "for": lambda st: ["Camera shows a changed task sequence",
                            "Movement pattern differs from standard work"],
        "against": ["Camera shows normal task sequence", "Same operator hit target this morning",
                    "Extra movement started after the slowdown, not before"],
    },
    "environment": {
        "name": "Environment",
        "for": lambda st: ["Cell temperature outside the normal band",
                            "Deviation logged at shift start"],
        "against": ["Cell temperature normal", "Neighbouring stations unaffected"],
    },
}

# ----------------------------------------------------------------------- evidence
# Each source "checks" one cause. Whether it comes back supporting or against
# depends on which cause is actually true this incident - so the same four
# buttons read differently every time.
EVIDENCE_META = [
    {"id": "camera", "label": "Run camera check", "icon": "camera", "gain": 16, "checks": "operator"},
    {"id": "maintenance", "label": "Check maintenance history", "icon": "wrench", "gain": 14, "checks": "machine"},
    {"id": "cycles", "label": "Compare previous cycles", "icon": "chart", "gain": 13, "checks": "machine"},
    {"id": "operator", "label": "Ask operator", "icon": "person", "gain": 10, "checks": "operator"},
]


def _evidence_text(meta: Dict[str, Any], hit: bool, station: Dict[str, Any]) -> tuple[str, str]:
    code, name = station["code"], station["name"]
    if meta["id"] == "camera":
        text = (f"Vision: task sequence has changed at {code}, operator movement up 18%."
                 if hit else "Vision: operator movement normal, task sequence unchanged.")
    elif meta["id"] == "maintenance":
        text = (f"{name} ({code}) last serviced 41 days ago, against a 30-day interval."
                 if hit else f"{name} ({code}) serviced on schedule, 12 days ago.")
    elif meta["id"] == "cycles":
        text = ("Last 3 cycles: 68s, 71s, 74s. Steadily climbing, not a one-off."
                 if hit else "Last 3 cycles measured close to target, no drift.")
    else:  # operator
        text = ("Operator reports the tool 'feels heavier' than this morning."
                 if hit else "Operator reports no change in tools or method.")
    label = CAUSE_LIB[meta["checks"]]["name"].lower()
    verdict = f"Supports {label}." if hit else f"Points away from {label}."
    return text, verdict


SCENARIOS = [
    {"id": "nothing", "name": "Do nothing", "risk_after": 82, "vehicles": 12,
     "downtime": "0 min now", "throughput": -12, "tone": "bad",
     "note": "Wear stays exactly where it is. Nothing improves until someone acts."},
    {"id": "adjust", "name": "Adjust parameter", "risk_after": 31, "vehicles": 3,
     "downtime": "0 min", "throughput": 6, "tone": "good",
     "note": "Recovers cycle time immediately. Manages the symptom, so pair it with service."},
    {"id": "repair", "name": "Repair now", "risk_after": 8, "vehicles": 1,
     "downtime": "15 min", "throughput": -3, "tone": "warn",
     "note": "Lowest risk, highest certain loss. 15 min of stop costs more than it saves today."},
    {"id": "wait", "name": "Wait for maintenance", "risk_after": 78, "vehicles": 9,
     "downtime": "Planned, 18:00", "throughput": -8, "tone": "warn",
     "note": "The window is 3 hours away. Barely better than doing nothing until it opens."},
]

# How well each scenario actually works once applied, expressed as how much of
# `wear` gets cancelled out for cycle time and for defect risk respectively.
# A rejected decision (or "Do nothing") cancels nothing at all - the station
# just sits at its alert-level wear until the next incident.
ACTION_EFFECTIVENESS = {
    "adjust":  {"cycle": 0.78, "risk": 0.62},   # quick parameter tweak: recovers cycle time, risk lingers
    "repair":  {"cycle": 0.95, "risk": 0.90},   # a real fix: both come down hard
    "wait":    {"cycle": 0.10, "risk": 0.08},   # exposure continues almost unchanged for hours
    "nothing": {"cycle": 0.0,  "risk": 0.0},    # no action at all
}
NO_ACTION = {"cycle": 0.0, "risk": 0.0}

# Other plants in the fleet. Only Plant A is the live twin; B and C are
# described by their station sensing mix, and coverage is derived with the
# same formula the live twin uses, so every plant is measured the same way.
OTHER_PLANTS = [
    {"id": "B", "name": "Plant B", "city": "Chennai", "age": "9 yrs", "lines": 4,
     "mix": {FULL: 45, SHADOW: 13, MANUAL: 6},
     "note": "Mixed retrofit. A fifth of stations run on inference."},
    {"id": "C", "name": "Plant C", "city": "Sanand", "age": "17 yrs", "lines": 3,
     "mix": {FULL: 24, SHADOW: 22, MANUAL: 5},
     "note": "Legacy line. Much of the picture is inferred, and it still works."},
]


def _plant_summary(pid, name, city, age, lines, mix, note, live=False):
    stations = sum(mix.values())
    coverage = round(sum(COVER[k] * n for k, n in mix.items()) / stations)
    return {
        "id": pid, "name": name, "city": city, "age": age, "lines": lines,
        "stations": stations, "coverage": coverage, "live": live, "note": note,
        "counts": {k: mix[k] for k in (FULL, SHADOW, MANUAL)},
    }


# Plant-level results that are reported, not simulated. Kept in one place so
# the same number is shown wherever it appears.
PERFORMANCE = {
    "weekly_output": 8412, "weekly_output_change_pct": 3,
    "downtime_min": 182, "downtime_change_pct": -31,
    "defects_per_100": 1.7, "defects_per_100_before": 3.1,
}
BUSINESS = {"annual_benefit_cr": 14.2, "payback_months": 7.5}

# ------------------------------------------------------------------------ roles
# Three login roles, each with its own dashboard. Prototype credentials only.
ROLES = {
    "floormanager":   {"password": "Floor@123",   "role": "floor_manager",
                        "name": "Floor Manager",   "label": "Suresh Nair"},
    "factorymanager": {"password": "Factory@123", "role": "factory_manager",
                        "name": "Factory Manager", "label": "Aditi Rao"},
    "leadership":     {"password": "Leader@123",  "role": "leadership",
                        "name": "Leadership",      "label": "V. Kulkarni"},
}

# -------------------------------------------------------------------- documents
# A tiny in-memory "document library" for the Data page (Add / Edit / View).
# Not part of the simulation clock, so it survives incidents resolving.
DOC_CATEGORIES = [
    {"id": "manuals",     "name": "Manuals",              "accept": ".pdf",        "kind": "pdf"},
    {"id": "production",  "name": "Production data",      "accept": ".xlsx,.csv",  "kind": "excel"},
    {"id": "downtime",    "name": "Downtime data",        "accept": ".xlsx,.csv",  "kind": "excel"},
    {"id": "quality",     "name": "Quality data",         "accept": ".xlsx,.csv",  "kind": "excel"},
    {"id": "maintenance", "name": "Maintenance records",  "accept": ".xlsx,.csv,.pdf", "kind": "mixed"},
]

_doc_ids = itertools.count(1)


class DocumentStore:
    def __init__(self) -> None:
        self.items: List[Dict[str, Any]] = []

    def list(self) -> List[Dict[str, Any]]:
        return sorted(self.items, key=lambda d: d["uploaded_at"], reverse=True)

    def add(self, category: str, filename: str, size: int, path: str, uploaded_by: str) -> Dict[str, Any]:
        doc = {
            "id": next(_doc_ids), "category": category, "name": filename,
            "size": size, "path": path, "uploaded_by": uploaded_by,
            "uploaded_at": time.time(),
        }
        self.items.append(doc)
        return doc

    def get(self, doc_id: int) -> Optional[Dict[str, Any]]:
        return next((d for d in self.items if d["id"] == doc_id), None)

    def update(self, doc_id: int, name: Optional[str], category: Optional[str]) -> Optional[Dict[str, Any]]:
        doc = self.get(doc_id)
        if not doc:
            return None
        if name:
            doc["name"] = name
        if category:
            doc["category"] = category
        return doc

    def delete(self, doc_id: int) -> bool:
        doc = self.get(doc_id)
        if not doc:
            return False
        self.items.remove(doc)
        return True


documents = DocumentStore()


def build_lines() -> List[Dict[str, Any]]:
    """Every station in the plant, grouped by line. Deterministic."""
    out = []
    for d in LINE_DEFS:
        stations = []
        for i, name in enumerate(d["names"]):
            n = i + 1
            sensing = (SHADOW if n in d["shadow"] else
                       MANUAL if n in d["manual"] else FULL)
            stations.append({
                "code": f"{d['prefix']}{n:02d}",
                "n": n,
                "line": d["id"],
                "name": name,
                "process": STATION_META[name][0],
                "parts": STATION_META[name][1],
                "sensing": sensing,
                "coverage": COVER[sensing],
                "base_status": "warning" if n in d["warning"] else "healthy",
                "base_cycle": round(56 + (n * 7 % 6) + (5 if n in d["warning"] else 0), 1),
            })
        coverage = round(sum(s["coverage"] for s in stations) / len(stations))
        out.append({"id": d["id"], "name": d["name"], "coverage": coverage,
                    "count": len(stations), "stations": stations})
    return out


LINES = build_lines()
ALL_STATIONS = [s for ln in LINES for s in ln["stations"]]


def find_station(code: str) -> Dict[str, Any]:
    return next(s for s in ALL_STATIONS if s["code"] == code)


@dataclass
class Twin:
    t: int = 14 * 3600 + 31 * 60
    tick: int = 0
    wear: float = 0.0
    fixed: float = 0.0
    phase: str = "calm"                 # calm | rising | alert | acting | done
    speed: int = 1
    running: bool = True
    focus: str = "S17"                  # which station this incident is about
    true_cause: str = "machine"         # which cause is actually correct this incident
    evidence: List[str] = field(default_factory=list)
    decision: Dict[str, Any] | None = None
    feedback: bool | None = None
    events: List[Dict[str, Any]] = field(default_factory=list)
    trend: List[Dict[str, float]] = field(default_factory=list)
    seen: Dict[str, bool] = field(default_factory=dict)
    alert_metrics: Dict[str, Any] | None = None
    cooldown: int = 0                   # ticks left before the next incident starts
    eff: Dict[str, float] = field(default_factory=lambda: dict(ACTION_EFFECTIVENESS["adjust"]))
    running_accuracy: int = 87          # carried across incidents; updated by human verdicts
    reviews: int = 0

    # ---------------------------------------------------------------- derived
    @property
    def confidence(self) -> int:
        if self.phase in ("calm", "rising"):
            return 92
        gained = sum(e["gain"] for e in EVIDENCE_META if e["id"] in self.evidence)
        return min(94, 54 + gained)

    @property
    def ready(self) -> bool:
        return self.confidence >= THRESHOLD

    def focus_station(self) -> Dict[str, Any]:
        return find_station(self.focus)

    def metrics(self) -> Dict[str, float]:
        wobble = math.sin(self.tick * 0.6) * 0.4
        cycle_effective = self.wear * (1 - self.eff["cycle"] * self.fixed)
        risk_effective = self.wear * (1 - self.eff["risk"] * self.fixed)
        cycle = 60 + 14 * cycle_effective + wobble
        # Fixing the symptom does not fully remove the underlying risk.
        risk = 4 + 78 * risk_effective
        return {
            "cycle_time": round(cycle, 1),
            "target": TAKT,
            "defect_risk": round(min(99, risk)),
            "bottleneck_risk": round(min(99, 5 + 71 * cycle_effective)),
            "queue": round(2 + 14 * cycle_effective),
            "throughput": round(3600 / max(cycle, 58)),
        }

    def evidence_options(self) -> List[Dict[str, Any]]:
        station = self.focus_station()
        out = []
        for meta in EVIDENCE_META:
            hit = meta["checks"] == self.true_cause
            text, verdict = _evidence_text(meta, hit, station)
            out.append({**meta, "result": text, "verdict": verdict})
        return out

    def causes(self) -> List[Dict[str, Any]]:
        p = max(0.0, min(1.0, (self.confidence - 54) / 40))
        station = self.focus_station()
        others = [c for c in CAUSE_ORDER if c != self.true_cause]
        pairs = {self.true_cause: CAUSE_PAIRS[0],
                 others[0]: CAUSE_PAIRS[1], others[1]: CAUSE_PAIRS[2], others[2]: CAUSE_PAIRS[3]}
        out = []
        for cid in CAUSE_ORDER:
            start, end = pairs[cid]
            value = round(start + (end - start) * p)
            supported = cid == self.true_cause
            lib = CAUSE_LIB[cid]
            out.append({
                "id": cid, "name": lib["name"], "value": value,
                "verdict": "supported" if supported else "rejected",
                "for": lib["for"](station) if supported else [],
                "against": [] if supported else lib["against"],
            })
        return out

    def lines(self) -> List[Dict[str, Any]]:
        """All lines with live station status folded in."""
        m = self.metrics()
        focus_status = ("healthy" if self.phase == "calm"
                        else "critical" if m["defect_risk"] > 55
                        else "warning" if m["defect_risk"] > 22 else "healthy")
        out = []
        for ln in LINES:
            stations = []
            for s in ln["stations"]:
                if s["code"] == self.focus:
                    status, cycle = focus_status, m["cycle_time"]
                else:
                    status, cycle = s["base_status"], s["base_cycle"]
                stations.append({
                    "code": s["code"], "n": s["n"], "line": s["line"], "name": s["name"],
                    "process": s["process"], "parts": s["parts"],
                    "sensing": s["sensing"], "coverage": s["coverage"],
                    "status": status, "cycle": cycle,
                })
            alerts = sum(1 for s in stations if s["status"] != "healthy")
            worst = ("critical" if any(s["status"] == "critical" for s in stations)
                     else "warning" if alerts else "healthy")
            out.append({
                "id": ln["id"], "name": ln["name"], "coverage": ln["coverage"],
                "count": ln["count"], "alerts": alerts, "status": worst,
                "shadow": sum(1 for s in stations if s["sensing"] == SHADOW),
                "manual": sum(1 for s in stations if s["sensing"] == MANUAL),
                "stations": stations,
            })
        return out

    # ----------------------------------------------------------------- ticking
    def log(self, text: str, kind: str = "info", once: str | None = None) -> None:
        if once:
            if self.seen.get(once):
                return
            self.seen[once] = True
        self.events.insert(0, {"t": self.t, "text": text, "kind": kind})
        del self.events[24:]

    def _start_new_incident(self) -> None:
        """Pick a fresh station and a fresh true cause. Any station, any line,
        any sensing tier can be the one that develops a problem next."""
        candidate = random.choice(ALL_STATIONS)
        self.focus = candidate["code"]
        self.true_cause = random.choices(CAUSE_ORDER, weights=CAUSE_WEIGHTS, k=1)[0]
        self.wear = 0.0
        self.fixed = 0.0
        self.evidence = []
        self.decision = None
        self.feedback = None
        self.alert_metrics = None
        self.seen = {}
        self.tick = 0
        self.phase = "calm"
        self.eff = dict(ACTION_EFFECTIVENESS["adjust"])

    def step(self) -> None:
        if not self.running:
            return
        self.tick += 1
        self.t += 20 * self.speed
        code = self.focus

        if self.phase == "calm" and self.tick > 40:
            self.phase = "rising"
        if self.phase == "rising":
            self.wear = min(1.0, self.wear + 0.035 * self.speed)
            if self.wear > 0.2:
                self.log(f"{code} cycle time creeping up.", "info", "e1")
            if self.wear > 0.45:
                self.log(f"Queue forming behind {code}.", "warn", "e2")
            if self.wear > 0.7:
                self.log(f"Vision picks up hesitation at {code}.", "warn", "e3")
            if self.wear >= 1.0:
                self.phase = "alert"
                self.alert_metrics = self.metrics()
                self.log(f"Defect risk {self.alert_metrics['defect_risk']}%. "
                         f"Confidence only {self.confidence}%.", "alert", "e4")
                self.log("Holding back a recommendation until I know more.", "alert", "e5")
        if self.phase == "acting":
            self.fixed = min(1.0, self.fixed + 0.09 * self.speed)
            if self.fixed >= 0.82:
                self.phase = "done"
                rejected = self.decision and self.decision["verdict"] == "rejected"
                msg = (f"No action taken. {code} settled at elevated risk."
                       if rejected else f"Action applied. {code} settling.")
                self.log(msg, "warn" if rejected else "good", "e6")
                self.cooldown = 26
        if self.phase == "done":
            self.cooldown = max(0, self.cooldown - 1)
            if self.cooldown == 0:
                self._start_new_incident()

        m = self.metrics()
        self.trend.append({"t": self.t, "cycle": m["cycle_time"], "risk": m["defect_risk"]})
        del self.trend[:-40]

    # ----------------------------------------------------------------- actions
    def collect(self, eid: str) -> Dict[str, Any]:
        item = next((e for e in self.evidence_options() if e["id"] == eid), None)
        if item is None:
            raise KeyError(eid)
        before = self.confidence
        if eid not in self.evidence:
            self.evidence.append(eid)
        self.log(f"Evidence in: {item['label'].lower()}.", "good")
        return {**item, "confidence_before": before, "confidence_after": self.confidence}

    def decide(self, scenario_id: str, verdict: str) -> Dict[str, Any]:
        sc = next((s for s in SCENARIOS if s["id"] == scenario_id), SCENARIOS[1])
        self.decision = {"scenario": sc, "verdict": verdict}
        self.log(f"Human {verdict} - {sc['name'].lower()}.", "good")
        # A rejected decision behaves exactly like "no action": the station is
        # simply left at its alert-level wear until the next incident. An
        # approved decision applies whichever scenario was actually picked -
        # a quick adjust, a real repair, a wait, or explicitly doing nothing -
        # each with its own effect on cycle time and defect risk.
        self.eff = dict(NO_ACTION) if verdict == "rejected" else dict(ACTION_EFFECTIVENESS.get(scenario_id, ACTION_EFFECTIVENESS["adjust"]))
        self.phase = "acting"
        self.speed = max(self.speed, 3)
        return self.decision

    def outcome(self) -> Dict[str, Any]:
        m = self.metrics()
        before = self.alert_metrics or {"defect_risk": 82, "cycle_time": 74}
        risk_before, cycle_before = before["defect_risk"], before["cycle_time"]

        verdict = self.decision["verdict"] if self.decision else None
        scenario = self.decision["scenario"] if self.decision else None
        if verdict == "rejected":
            # Nothing was applied, so nothing was promised to change.
            predicted = 0
        elif scenario:
            predicted = risk_before - scenario["risk_after"]
        else:
            predicted = round(risk_before * 0.62)
        actual = risk_before - m["defect_risk"]

        if verdict == "rejected":
            residual = "No action was taken. Risk stays at the alert level until the next check."
        elif scenario and scenario["id"] == "repair":
            residual = "A real repair was made. Risk is down close to baseline."
        elif scenario and scenario["id"] == "wait":
            residual = f"Still waiting on the {scenario['downtime']} maintenance window. Risk stays mostly elevated until then."
        else:
            residual = "Underlying wear is still there."

        return {
            "predicted_drop": predicted,
            "actual_drop": actual,
            "accuracy": max(0, round(100 - abs(predicted - actual) / max(abs(predicted), 1) * 100)),
            "risk_before": risk_before, "risk_after": m["defect_risk"],
            "cycle_before": cycle_before, "cycle_after": m["cycle_time"],
            "settled": self.phase == "done",
            "residual": residual,
            "verdict": verdict,
            "scenario_id": scenario["id"] if scenario else None,
            "scenario_name": scenario["name"] if scenario else None,
            "focus": self.focus_station(),
        }

    def record_feedback(self, correct: bool) -> Dict[str, Any]:
        before = self.running_accuracy
        self.feedback = correct
        self.reviews += 1
        self.running_accuracy = max(50, min(99, before + (2 if correct else -1)))
        self.log("Outcome confirmed by a person. Added to history.", "good")
        return {"accuracy_before": before, "accuracy_after": self.running_accuracy,
                "learned": [
                    "This evidence order gets suggested first next time.",
                    f"{self.focus}'s wear signature is now a known pattern.",
                    "Confidence calibration nudged for this station.",
                ]}

    def plants(self) -> List[Dict[str, Any]]:
        mix = {FULL: 0, SHADOW: 0, MANUAL: 0}
        for s in ALL_STATIONS:
            mix[s["sensing"]] += 1
        live = _plant_summary("A", "Plant A", "Pune", "4 yrs", len(LINES), mix,
                              "Newest plant. Almost everything is measured directly.", live=True)
        return [live] + [_plant_summary(p["id"], p["name"], p["city"], p["age"], p["lines"],
                                        p["mix"], p["note"]) for p in OTHER_PLANTS]

    def snapshot(self) -> Dict[str, Any]:
        lines = self.lines()
        station = self.focus_station()
        shift = "A" if 6 * 3600 <= self.t % (24 * 3600) < 14 * 3600 \
            else "B" if 14 * 3600 <= self.t % (24 * 3600) < 22 * 3600 else "C"
        return {
            "clock": {"seconds": self.t, "day": "Monday", "shift": shift},
            "sim": {"running": self.running, "speed": self.speed, "phase": self.phase},
            "confidence": self.confidence,
            "threshold": THRESHOLD,
            "ready": self.ready,
            "metrics": self.metrics(),
            "focus": self.focus,
            "focus_station": {"code": station["code"], "name": station["name"],
                               "line": station["line"], "coverage": station["coverage"],
                               "sensing": station["sensing"]},
            "lines": lines,
            "totals": {
                "stations": sum(l["count"] for l in lines),
                "alerts": sum(l["alerts"] for l in lines),
                # Same formula as the plant summary, so "coverage" is one number everywhere.
                "coverage": round(sum(s["coverage"] for s in ALL_STATIONS) / len(ALL_STATIONS)),
            },
            "events": self.events,
            "trend": self.trend,
            "evidence_taken": self.evidence,
            "decision": self.decision,
            "feedback": self.feedback,
            "learning": {"running_accuracy": self.running_accuracy, "reviews": self.reviews},
        }


twin = Twin()
