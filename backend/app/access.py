"""Who can see what.

Three roles in a strict order of authority. Every feature has a minimum role.
A person below that level sees the feature locked. Only someone with more
authority than them can grant it, and only for features that grantor already
holds in their own right. Grants are kept server-side and checked on every
protected request, so a lower role can never unlock anything from the browser.
"""
from __future__ import annotations

import secrets
from typing import Dict, Optional, Set

from .state import ROLES

LEVEL = {"floor_manager": 1, "factory_manager": 2, "leadership": 3}
ROLE_NAME = {r["role"]: r["name"] for r in ROLES.values()}

# id -> minimum role level, whether it may be granted downward, and a label.
FEATURES: Dict[str, Dict] = {
    "performance": {"min": 2, "grantable": True,  "name": "Plant performance"},
    "portfolio":   {"min": 3, "grantable": True,  "name": "Plant portfolio"},
    "data_manage": {"min": 2, "grantable": True,  "name": "Edit and delete plant data"},
    "access":      {"min": 2, "grantable": False, "name": "Access control"},
}

_sessions: Dict[str, str] = {}                 # token -> role
_grants: Dict[str, Set[str]] = {r: set() for r in LEVEL}


def open_session(role: str) -> str:
    token = secrets.token_urlsafe(24)
    _sessions[token] = role
    return token


def role_for(token: Optional[str]) -> Optional[str]:
    return _sessions.get(token or "")


def can(role: Optional[str], feature: str) -> bool:
    if role not in LEVEL or feature not in FEATURES:
        return False
    return LEVEL[role] >= FEATURES[feature]["min"] or feature in _grants[role]


def can_grant(grantor: Optional[str], grantee: str, feature: str) -> bool:
    f = FEATURES.get(feature)
    if grantor not in LEVEL or grantee not in LEVEL or not f or not f["grantable"]:
        return False
    return (LEVEL[grantor] > LEVEL[grantee]          # only downward
            and LEVEL[grantor] >= f["min"]           # only what you hold by right
            and LEVEL[grantee] < f["min"])           # nothing to grant otherwise


def set_grant(grantor: str, grantee: str, feature: str, on: bool) -> None:
    if not can_grant(grantor, grantee, feature):
        raise PermissionError("You don't have the authority to change this access.")
    (_grants[grantee].add if on else _grants[grantee].discard)(feature)


def summary(role: str) -> Dict:
    """What this role can use now, and — for people who manage access — the
    full picture of who holds what and which switches they may flip."""
    out = {
        "role": role, "level": LEVEL[role],
        "features": {fid: {"name": f["name"], "min": f["min"],
                           "min_role": next(n for r, n in ROLE_NAME.items() if LEVEL[r] == f["min"]),
                           "allowed": can(role, fid), "grantable": f["grantable"],
                           "granted": fid in _grants[role]}
                     for fid, f in FEATURES.items()},
    }
    if can(role, "access"):
        out["manage"] = [
            {"role": r, "name": ROLE_NAME[r], "level": LEVEL[r],
             "features": [{"id": fid, "name": f["name"], "on": can(r, fid),
                           "by_role": LEVEL[r] >= f["min"],
                           "editable": can_grant(role, r, fid)}
                          for fid, f in FEATURES.items()]}
            for r in sorted(LEVEL, key=LEVEL.get) if LEVEL[r] < LEVEL[role]
        ]
    return out
