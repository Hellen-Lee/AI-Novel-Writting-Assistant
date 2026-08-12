"""Persist Agent run ledgers for future Agent Viewer (no UI this phase)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.services import project_store


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _runs_dir(project_id: str) -> Path:
    return project_store.get_project_dir(project_id) / "agent" / "runs"


def new_run_id() -> str:
    return f"run_{uuid.uuid4().hex[:12]}"


def save_run(
    project_id: str,
    *,
    session_id: str,
    model: str = "",
    steps: Optional[list[dict[str, Any]]] = None,
    run_id: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Write data/projects/{id}/agent/runs/{run_id}.json.

    Each step typically: mode, skill_name?, system, user, response,
    chars_est / budget_report, latency_ms.
    """
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    rid = run_id or new_run_id()
    payload: dict[str, Any] = {
        "run_id": rid,
        "session_id": session_id,
        "created_at": _now_iso(),
        "model": model or "",
        "steps": list(steps or []),
    }
    if extra:
        payload.update(extra)

    path = _runs_dir(project_id) / f"{rid}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return payload


def make_step(
    mode: str,
    *,
    skill_name: str = "",
    system: str = "",
    user: str = "",
    response: str = "",
    budget_report: Optional[dict[str, Any]] = None,
    latency_ms: int = 0,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    step: dict[str, Any] = {
        "mode": mode,
        "skill_name": skill_name or "",
        "system": system or "",
        "user": user or "",
        "response": response or "",
        "chars_est": {
            "system": len(system or ""),
            "user": len(user or ""),
            "response": len(response or ""),
        },
        "budget_report": budget_report or {},
        "latency_ms": int(latency_ms),
    }
    if extra:
        step.update(extra)
    return step
