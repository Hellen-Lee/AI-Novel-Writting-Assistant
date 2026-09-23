"""Persist Agent run ledgers for Agent Viewer (developer observation)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.services import project_store, reasoning_store

USER_INPUT_PREVIEW_LEN = 200
REASONING_PERSIST_MAX_CHARS = reasoning_store.DEFAULT_STEP_MAX_CHARS
REASONING_TRUNCATION_SUFFIX = "…（思考过程已截断）"


def _bound_reasoning(value: Any) -> tuple[str, bool]:
    reasoning = str(value or "")
    if len(reasoning) <= REASONING_PERSIST_MAX_CHARS:
        return reasoning, False
    keep = max(
        0,
        REASONING_PERSIST_MAX_CHARS - len(REASONING_TRUNCATION_SUFFIX),
    )
    return reasoning[:keep] + REASONING_TRUNCATION_SUFFIX, True


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
    persisted_steps = _prepare_steps(project_id, rid, steps or [])
    payload: dict[str, Any] = {
        "schema_version": 2,
        "run_id": rid,
        "session_id": session_id,
        "created_at": _now_iso(),
        "model": model or "",
        "execution": {
            "turn_id": "",
            "attempt": 1,
            "parent_run_id": "",
        },
        "steps": persisted_steps,
    }
    if extra:
        payload.update(extra)

    path = _run_path(project_id, rid)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    reasoning_store.remove_stale_parts(project_id)
    evicted = reasoning_store.cleanup_project(project_id)
    for evicted_run_id in evicted:
        _mark_reasoning_evicted(project_id, evicted_run_id)
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
    step_index: Optional[int] = None,
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
    if step_index is not None:
        step["step_index"] = int(step_index)
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
    return _hydrate_run(data, path=path, run_id=run_id)


def list_runs_for_session(project_id: str, session_id: str) -> list[dict[str, Any]]:
    """Full run payloads for one session, oldest first (conversation order)."""
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    sid = (session_id or "").strip()
    if sid in {"__none__", "-", "none"}:
        sid = ""
    directory = _runs_dir(project_id)
    if not directory.exists():
        return []

    items: list[dict[str, Any]] = []
    for path in directory.glob("*.json"):
        data = _read_run_file(path)
        if data is None:
            continue
        if str(data.get("session_id") or "").strip() != sid:
            continue
        items.append(_hydrate_run(data, path=path))

    items.sort(key=lambda row: str(row.get("created_at") or ""))
    return items


def delete_runs_for_session(project_id: str, session_id: str) -> None:
    """Delete all run ledgers belonging to one session."""
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    sid = str(session_id or "").strip()
    directory = _runs_dir(project_id)
    if not directory.exists():
        return

    for path in directory.glob("*.json"):
        data = _read_run_file(path)
        if data is None:
            continue
        if str(data.get("session_id") or "").strip() != sid:
            continue
        run_id = str(data.get("run_id") or path.stem)
        reasoning_store.delete_run(project_id, run_id)
        path.unlink(missing_ok=True)


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
    response_preview = ""

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
        reference = step.get("reasoning_ref") or {}
        if (
            report.get("truncated")
            or step.get("reasoning_truncated")
            or reference.get("truncated")
            or reference.get("status") == "evicted"
        ):
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
        if mode in {"skill", "chat"}:
            response_preview = str(step.get("response") or "")
        latency_total += int(step.get("latency_ms") or 0)

    created = str(data.get("created_at") or "")
    if not created and path is not None:
        created = _iso_from_mtime(path)

    remaining = exec_remaining if exec_remaining is not None else last_remaining
    return {
        "run_id": str(data.get("run_id") or (path.stem if path else "")),
        "session_id": str(data.get("session_id") or ""),
        "created_at": created,
        "model": str(data.get("model") or ""),
        "user_input": _clip(data.get("user_input") or ""),
        "response_preview": _clip(response_preview),
        "modes": modes,
        "skill_names": skill_names,
        "tools": tool_names,
        "truncated": truncated,
        "remaining_pct": remaining,
        "latency_ms_total": latency_total,
        "step_count": len(steps),
    }


def _hydrate_run(
    data: dict[str, Any],
    *,
    path: Path,
    run_id: str = "",
) -> dict[str, Any]:
    data["steps"] = [_normalize_step(step) for step in (data.get("steps") or [])]
    data.setdefault("run_id", run_id or path.stem)
    data.setdefault("session_id", "")
    data.setdefault("created_at", _iso_from_mtime(path))
    data.setdefault("model", "")
    data.setdefault("user_input", "")
    return data


def _prepare_steps(
    project_id: str,
    run_id: str,
    steps: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Normalize step indexes and move legacy inline reasoning to sidecars."""
    policy = reasoning_store.ReasoningPolicy.from_config()
    writer = reasoning_store.ReasoningWriter(project_id, run_id, policy=policy)
    pending: dict[int, dict[str, Any]] = {}
    prepared: list[dict[str, Any]] = []
    for index, raw_step in enumerate(steps):
        step = dict(raw_step) if isinstance(raw_step, dict) else make_step("unknown")
        step.setdefault("step_index", index)
        step_index = int(step["step_index"])
        inline_reasoning = step.get("reasoning")
        reference = step.get("reasoning_ref")
        if isinstance(reference, dict):
            preview = str(reference.get("preview") or inline_reasoning or "")
            step["reasoning"] = preview
            step["reasoning_ref"] = reference
            if reference.get("truncated"):
                step["reasoning_truncated"] = True
        elif isinstance(inline_reasoning, str) and inline_reasoning:
            writer.append(step_index, inline_reasoning)
            pending[step_index] = step
        prepared.append(step)
    references = writer.finalize_all()
    for step_index, step in pending.items():
        reference = references.get(step_index)
        if not reference:
            continue
        step["reasoning"] = reference["preview"]
        step["reasoning_ref"] = reference
        if reference.get("truncated"):
            step["reasoning_truncated"] = True
    return prepared


def _mark_reasoning_evicted(project_id: str, run_id: str) -> None:
    """Mark sidecar references after quota cleanup without deleting the run."""
    try:
        path = _run_path(project_id, run_id)
    except FileNotFoundError:
        return
    data = _read_run_file(path)
    if data is None:
        return
    changed = False
    for step in data.get("steps") or []:
        if not isinstance(step, dict):
            continue
        reference = step.get("reasoning_ref")
        if isinstance(reference, dict) and reference.get("status") != "evicted":
            updated = dict(reference)
            updated["status"] = "evicted"
            step["reasoning_ref"] = updated
            changed = True
    if changed:
        with path.open("w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)


def _clip(text: Any, limit: int = USER_INPUT_PREVIEW_LEN) -> str:
    preview = str(text or "")
    if len(preview) > limit:
        return preview[:limit]
    return preview


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
    out.setdefault("step_index", None)
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
