"""Persist Agent run ledgers for Agent Viewer (developer observation)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.services import project_store

USER_INPUT_PREVIEW_LEN = 200


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _runs_dir(project_id: str) -> Path:
    return project_store.get_project_dir(project_id) / "agent" / "runs"


def _run_path(project_id: str, run_id: str) -> Path:
    rid = (run_id or "").strip()
    if not rid or "/" in rid or "\\" in rid or rid in {".", ".."}:
        raise FileNotFoundError(f"运行记录不存在: {run_id}")
    return _runs_dir(project_id) / f"{rid}.json"


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

    Each step is one model call: mode, skill_*, tools, system/user/response,
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

    path = _run_path(project_id, rid)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return payload


def make_step(
    mode: str,
    *,
    skill_name: str = "",
    skill_kind: str = "",
    skill_source: str = "",
    candidate_skills: Optional[list[str]] = None,
    tools: Optional[list[dict[str, Any]]] = None,
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
        "skill_kind": skill_kind or "",
        "skill_source": skill_source or "",
        "candidate_skills": list(candidate_skills or []),
        "tools": list(tools or []),
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


def list_runs(project_id: str) -> list[dict[str, Any]]:
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    directory = _runs_dir(project_id)
    if not directory.exists():
        return []

    items: list[dict[str, Any]] = []
    for path in directory.glob("*.json"):
        data = _read_run_file(path)
        if data is None:
            continue
        items.append(summarize_run(data, path=path))

    items.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
    return items


def get_run(project_id: str, run_id: str) -> dict[str, Any]:
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    path = _run_path(project_id, run_id)
    if not path.is_file():
        raise FileNotFoundError(f"运行记录不存在: {run_id}")

    data = _read_run_file(path)
    if data is None:
        raise FileNotFoundError(f"运行记录不存在: {run_id}")

    data["steps"] = [_normalize_step(step) for step in (data.get("steps") or [])]
    data.setdefault("run_id", run_id)
    data.setdefault("session_id", "")
    data.setdefault("created_at", _iso_from_mtime(path))
    data.setdefault("model", "")
    data.setdefault("user_input", "")
    return data


def summarize_run(
    data: dict[str, Any],
    *,
    path: Optional[Path] = None,
) -> dict[str, Any]:
    steps = [_normalize_step(step) for step in (data.get("steps") or [])]
    modes: list[str] = []
    skill_names: list[str] = []
    tool_names: list[str] = []
    truncated = False
    exec_remaining: Optional[float] = None
    last_remaining: Optional[float] = None
    latency_total = 0

    for step in steps:
        mode = str(step.get("mode") or "")
        if mode:
            modes.append(mode)
        name = str(step.get("skill_name") or "")
        if name and name not in skill_names:
            skill_names.append(name)
        for tool in step.get("tools") or []:
            tname = _tool_name(tool)
            if tname and tname not in tool_names:
                tool_names.append(tname)
        report = step.get("budget_report") or {}
        if report.get("truncated"):
            truncated = True
        if "remaining_pct" in report:
            try:
                pct = float(report["remaining_pct"])
            except (TypeError, ValueError):
                pct = None
            if pct is not None:
                last_remaining = pct
                if mode in {"skill", "chat"}:
                    exec_remaining = pct
        latency_total += int(step.get("latency_ms") or 0)

    created = str(data.get("created_at") or "")
    if not created and path is not None:
        created = _iso_from_mtime(path)

    preview = str(data.get("user_input") or "")
    if len(preview) > USER_INPUT_PREVIEW_LEN:
        preview = preview[:USER_INPUT_PREVIEW_LEN]

    remaining = exec_remaining if exec_remaining is not None else last_remaining
    return {
        "run_id": str(data.get("run_id") or (path.stem if path else "")),
        "session_id": str(data.get("session_id") or ""),
        "created_at": created,
        "model": str(data.get("model") or ""),
        "user_input": preview,
        "modes": modes,
        "skill_names": skill_names,
        "tools": tool_names,
        "truncated": truncated,
        "remaining_pct": remaining,
        "latency_ms_total": latency_total,
        "step_count": len(steps),
    }


def _read_run_file(path: Path) -> Optional[dict[str, Any]]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    if not raw.get("run_id"):
        raw["run_id"] = path.stem
    return raw


def _normalize_step(step: Any) -> dict[str, Any]:
    if not isinstance(step, dict):
        return make_step("unknown")
    out = dict(step)
    out.setdefault("mode", "")
    out.setdefault("skill_name", "")
    out.setdefault("skill_kind", "")
    out.setdefault("skill_source", "")
    if not isinstance(out.get("candidate_skills"), list):
        out["candidate_skills"] = []
    if not isinstance(out.get("tools"), list):
        out["tools"] = []
    out.setdefault("system", "")
    out.setdefault("user", "")
    out.setdefault("response", "")
    out.setdefault("chars_est", {})
    out.setdefault("budget_report", {})
    out.setdefault("latency_ms", 0)
    return out


def _tool_name(tool: Any) -> str:
    if isinstance(tool, str):
        return tool.strip()
    if isinstance(tool, dict):
        return str(tool.get("name") or "").strip()
    return ""


def _iso_from_mtime(path: Path) -> str:
    try:
        ts = path.stat().st_mtime
    except OSError:
        return ""
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()
