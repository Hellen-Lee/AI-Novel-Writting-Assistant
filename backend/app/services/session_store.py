"""Agent chat session persistence under data/projects/{id}/agent/."""

from __future__ import annotations

import json
import re
import shutil
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


def summarize_session(session: dict[str, Any]) -> dict[str, Any]:
    """会话 → 索引摘要（不含消息正文）。"""
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
        sessions.insert(0, summarize_session(session))
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
    data.setdefault("summary", "")
    data.setdefault("summary_at_round_count", 0)
    data.setdefault("context_usage", None)
    data.setdefault("updated_at", _now_ms())
    return data


def create_session(project_id: str, title: str = "新对话") -> dict[str, Any]:
    _ensure_project(project_id)
    clean_title = (title or "").strip() or "新对话"
    session = {
        "id": _new_session_id(),
        "title": clean_title[:64],
        "messages": [],
        "summary": "",
        "summary_at_round_count": 0,
        "context_usage": None,
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
    # G2：先清理附件目录，再删除会话 JSON。清理失败时保留会话，
    # 避免产生「无会话的附件」孤儿文件。
    _cleanup_session_assets(project_id, session_id)
    path.unlink(missing_ok=True)
    index = _load_index(project_id)
    index["sessions"] = [
        s
        for s in index["sessions"]
        if isinstance(s, dict) and s.get("id") != session_id
    ]
    _save_index(project_id, index)


def _cleanup_session_assets(project_id: str, session_id: str) -> None:
    """级联删除会话附属数据（附件目录 + run/reasoning 账本）。"""
    from app.services import attachment_store, run_store

    attachment_store.delete_session_attachments(project_id, session_id)
    run_store.delete_runs_for_session(project_id, session_id)


def _purge_session_assets(project_id: str) -> None:
    """整目录回收会话附属数据（附件 / run 账本 / reasoning sidecar）。

    这三类数据都以会话为单位组织，清空历史后没有需要保留的条目；
    整目录删除同时覆盖索引与会话文件都已丢失的孤儿数据。
    """
    from app.services import reasoning_store

    agent_dir = _agent_dir(project_id)
    for name in ("attachments", "runs", reasoning_store.REASONING_DIR_NAME):
        shutil.rmtree(agent_dir / name, ignore_errors=True)


def rename_session(project_id: str, session_id: str, title: str) -> dict[str, Any]:
    """只改标题：不刷新 updated_at，避免重命名改变时间归档与列表顺序。"""
    session = get_session(project_id, session_id)
    clean = (title or "").strip()
    if not clean:
        raise ValueError("title 不能为空")
    session["title"] = clean[:64]
    # 用户显式命名后，空会话发出首条消息时不应再被自动标题覆盖
    session["title_locked"] = True
    _write_json(_session_path(project_id, session_id), session)
    _touch_index_entry(project_id, session)
    return session


def clear_sessions(project_id: str) -> int:
    """清空项目下全部会话（连同附件与 run 账本），返回删除条数。"""
    _ensure_project(project_id)
    index = _load_index(project_id)
    indexed_ids = {
        str(s.get("id"))
        for s in index["sessions"]
        if isinstance(s, dict) and s.get("id")
    }

    deleted = 0
    sessions_dir = _agent_dir(project_id) / "sessions"
    if sessions_dir.exists():
        for path in sessions_dir.glob("*.json"):
            path.unlink(missing_ok=True)
            # 索引缺失但会话文件仍在时也要计入删除条数
            if path.stem not in indexed_ids:
                deleted += 1
    deleted += len(indexed_ids)

    # 附属数据整目录回收：无需逐个会话扫描 run 目录，也一并清掉孤儿条目
    _purge_session_assets(project_id)
    _save_index(project_id, _empty_index())
    return deleted


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
    if title_if_empty and not existing and not session.get("title_locked"):
        text = (title_if_empty or "").strip()
        if text:
            session["title"] = text[:64]
    existing.extend(messages)
    session["messages"] = existing
    if status is not None:
        session["status"] = status
    return save_session(project_id, session)


def update_session_fields(
    project_id: str,
    session_id: str,
    *,
    summary: Optional[str] = None,
    summary_at_round_count: Optional[int] = None,
    status: Optional[str] = None,
    context_usage: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Patch session-level fields (summary / status / context_usage)."""
    session = get_session(project_id, session_id)
    if summary is not None:
        session["summary"] = summary
    if summary_at_round_count is not None:
        session["summary_at_round_count"] = int(summary_at_round_count)
    if status is not None:
        session["status"] = status
    if context_usage is not None:
        session["context_usage"] = context_usage
    return save_session(project_id, session)


# --- Conversation rounds / summary helpers ---

# Defaults used by generation_service (keep in sync with docs/build/07)
HISTORY_KEEP_ROUNDS = 3
SUMMARY_TRIGGER_ROUNDS = 6
SUMMARY_MIN_NEW_ROUNDS = 2


def count_rounds(messages: list[Any]) -> int:
    """Count user+assistant pairs (orphan trailing user counts as a round)."""
    if not isinstance(messages, list):
        return 0
    users = sum(1 for m in messages if isinstance(m, dict) and m.get("role") == "user")
    return users


def iter_rounds(messages: list[Any]) -> list[list[dict[str, Any]]]:
    """Group messages into rounds starting at each user message."""
    if not isinstance(messages, list):
        return []
    rounds: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        if role == "user":
            if current:
                rounds.append(current)
            current = [msg]
        elif current:
            current.append(msg)
    if current:
        rounds.append(current)
    return rounds


def messages_for_history(
    messages: list[Any],
    *,
    keep_rounds: int = HISTORY_KEEP_ROUNDS,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Split into (older_rounds_flat, recent_rounds_flat).
    Recent = last keep_rounds; older = everything before (for summarization input).
    """
    rounds = iter_rounds(messages)
    if keep_rounds <= 0 or len(rounds) <= keep_rounds:
        recent: list[dict[str, Any]] = []
        for r in rounds:
            recent.extend(r)
        return [], recent
    older_rounds = rounds[:-keep_rounds]
    recent_rounds = rounds[-keep_rounds:]
    older: list[dict[str, Any]] = []
    for r in older_rounds:
        older.extend(r)
    recent = []
    for r in recent_rounds:
        recent.extend(r)
    return older, recent


def should_refresh_summary(
    session: dict[str, Any],
    *,
    trigger_rounds: int = SUMMARY_TRIGGER_ROUNDS,
    min_new_rounds: int = SUMMARY_MIN_NEW_ROUNDS,
) -> bool:
    messages = session.get("messages") or []
    rounds = count_rounds(messages)
    if rounds <= trigger_rounds:
        return False
    prev = int(session.get("summary_at_round_count") or 0)
    return (rounds - prev) >= min_new_rounds


def format_messages_for_summary(messages: list[dict[str, Any]], *, max_chars: int = 6000) -> str:
    lines: list[str] = []
    for msg in messages:
        role = str(msg.get("role") or "")
        content = str(msg.get("content") or "").strip()
        if not content:
            continue
        label = "用户" if role == "user" else "助手"
        skill = str(msg.get("skill") or "").strip()
        prefix = f"{label}" + (f"[{skill}]" if skill else "")
        attachments = msg.get("attachments") or []
        attachment_names = [
            str(item.get("name") or "").strip()
            for item in attachments
            if isinstance(item, dict) and str(item.get("name") or "").strip()
        ]
        attachment_note = (
            f"（附件：{'、'.join(attachment_names)}）"
            if attachment_names
            else ""
        )
        lines.append(f"{prefix}{attachment_note}：{content}")
    text = "\n".join(lines)
    if len(text) > max_chars:
        return text[: max_chars - 20] + "\n…（已截断）"
    return text


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
    tools: Optional[list[dict[str, Any]]] = None,
    thinking: Optional[str] = None,
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
        if tools is not None:
            msg["tools"] = tools
        if thinking is not None:
            # 独立思考字段：不参与 content、摘要与上下文组装
            msg["thinking"] = thinking
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
    tools: Optional[list[dict[str, Any]]] = None,
    attachments: Optional[list[dict[str, Any]]] = None,
    selection: str = "",
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
    if tools is not None:
        msg["tools"] = tools
    if attachments:
        msg["attachments"] = attachments
    if selection:
        msg["selection"] = selection
    return msg


def ensure_default_session(project_id: str) -> dict[str, Any]:
    """Return newest session, or create one if the project has none."""
    items = list_sessions(project_id)
    if items:
        return get_session(project_id, items[0]["id"])
    return create_session(project_id, title="当前会话")
