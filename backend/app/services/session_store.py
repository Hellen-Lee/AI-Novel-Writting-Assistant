"""Agent chat session persistence under data/projects/{id}/agent/."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.services import project_store

SESSION_ID_RE = re.compile(r"^sess_[a-zA-Z0-9_]+$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _agent_dir(project_id: str) -> Path:
    return project_store.get_project_dir(project_id) / "agent"


def _index_path(project_id: str) -> Path:
    return _agent_dir(project_id) / "sessions.json"


def _session_path(project_id: str, session_id: str) -> Path:
    return _agent_dir(project_id) / "sessions" / f"{session_id}.json"


def _ensure_project(project_id: str) -> None:
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _empty_index() -> dict[str, Any]:
    return {"sessions": []}


def _load_index(project_id: str) -> dict[str, Any]:
    data = _read_json(_index_path(project_id), _empty_index())
    if not isinstance(data, dict):
        return _empty_index()
    sessions = data.get("sessions")
    if not isinstance(sessions, list):
        return _empty_index()
    return {"sessions": sessions}


def _save_index(project_id: str, index: dict[str, Any]) -> None:
    _write_json(_index_path(project_id), index)


def _new_session_id() -> str:
    return f"sess_{uuid.uuid4().hex[:12]}"


def _new_message_id(prefix: str = "m") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _summary_from_session(session: dict[str, Any]) -> dict[str, Any]:
    messages = session.get("messages") or []
    return {
        "id": session["id"],
        "title": session.get("title") or "新对话",
        "updated_at": session.get("updated_at") or _now_ms(),
        "message_count": len(messages) if isinstance(messages, list) else 0,
        "status": session.get("status") or "idle",
    }


def _touch_index_entry(
    project_id: str,
    session: dict[str, Any],
    *,
    remove: bool = False,
) -> None:
    index = _load_index(project_id)
    sessions = [s for s in index["sessions"] if isinstance(s, dict)]
    sessions = [s for s in sessions if s.get("id") != session["id"]]
    if not remove:
        sessions.insert(0, _summary_from_session(session))
    sessions.sort(key=lambda s: int(s.get("updated_at") or 0), reverse=True)
    _save_index(project_id, {"sessions": sessions})


def list_sessions(project_id: str) -> list[dict[str, Any]]:
    _ensure_project(project_id)
    index = _load_index(project_id)
    items = [s for s in index["sessions"] if isinstance(s, dict) and s.get("id")]
    items.sort(key=lambda s: int(s.get("updated_at") or 0), reverse=True)
    return items


def get_session(project_id: str, session_id: str) -> dict[str, Any]:
    _ensure_project(project_id)
    path = _session_path(project_id, session_id)
    if not path.exists():
        raise FileNotFoundError(f"会话不存在: {session_id}")
    data = _read_json(path, None)
    if not isinstance(data, dict) or not data.get("id"):
        raise FileNotFoundError(f"会话不存在: {session_id}")
    data.setdefault("messages", [])
    data.setdefault("title", "新对话")
    data.setdefault("status", "idle")
    data.setdefault("updated_at", _now_ms())
    return data


def create_session(project_id: str, title: str = "新对话") -> dict[str, Any]:
    _ensure_project(project_id)
    clean_title = (title or "").strip() or "新对话"
    session = {
        "id": _new_session_id(),
        "title": clean_title[:64],
        "messages": [],
        "status": "idle",
        "created_at": _now_iso(),
        "updated_at": _now_ms(),
    }
    _write_json(_session_path(project_id, session["id"]), session)
    _touch_index_entry(project_id, session)
    return session


def delete_session(project_id: str, session_id: str) -> None:
    _ensure_project(project_id)
    path = _session_path(project_id, session_id)
    if not path.exists():
        raise FileNotFoundError(f"会话不存在: {session_id}")
    path.unlink(missing_ok=True)
    index = _load_index(project_id)
    index["sessions"] = [
        s
        for s in index["sessions"]
        if isinstance(s, dict) and s.get("id") != session_id
    ]
    _save_index(project_id, index)


def save_session(project_id: str, session: dict[str, Any]) -> dict[str, Any]:
    _ensure_project(project_id)
    session_id = str(session.get("id") or "")
    if not session_id:
        raise ValueError("session.id 不能为空")
    session["updated_at"] = _now_ms()
    _write_json(_session_path(project_id, session_id), session)
    _touch_index_entry(project_id, session)
    return session


def append_messages(
    project_id: str,
    session_id: str,
    messages: list[dict[str, Any]],
    *,
    title_if_empty: Optional[str] = None,
    status: Optional[str] = None,
) -> dict[str, Any]:
    session = get_session(project_id, session_id)
    existing = session.get("messages")
    if not isinstance(existing, list):
        existing = []
    if title_if_empty and not existing:
        text = (title_if_empty or "").strip()
        if text:
            session["title"] = text[:64]
    existing.extend(messages)
    session["messages"] = existing
    if status is not None:
        session["status"] = status
    return save_session(project_id, session)


def update_message(
    project_id: str,
    session_id: str,
    message_id: str,
    *,
    content: Optional[str] = None,
    pending: Optional[bool] = None,
    error: Optional[str] = None,
    skill: Optional[str] = None,
    status: Optional[str] = None,
) -> dict[str, Any]:
    session = get_session(project_id, session_id)
    messages = session.get("messages") or []
    found = False
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        if msg.get("id") != message_id:
            continue
        found = True
        if content is not None:
            msg["content"] = content
        if pending is not None:
            msg["pending"] = pending
        if error is not None:
            msg["error"] = error
        if skill is not None:
            msg["skill"] = skill
        break
    if not found:
        raise FileNotFoundError(f"消息不存在: {message_id}")
    session["messages"] = messages
    if status is not None:
        session["status"] = status
    return save_session(project_id, session)


def make_message(
    role: str,
    content: str = "",
    *,
    skill: str = "",
    pending: bool = False,
    error: str = "",
    message_id: Optional[str] = None,
) -> dict[str, Any]:
    msg: dict[str, Any] = {
        "id": message_id or _new_message_id(),
        "role": role,
        "content": content,
        "created_at": _now_iso(),
    }
    if skill:
        msg["skill"] = skill
    if pending:
        msg["pending"] = True
    if error:
        msg["error"] = error
    return msg


def ensure_default_session(project_id: str) -> dict[str, Any]:
    """Return newest session, or create one if the project has none."""
    items = list_sessions(project_id)
    if items:
        return get_session(project_id, items[0]["id"])
    return create_session(project_id, title="当前会话")
