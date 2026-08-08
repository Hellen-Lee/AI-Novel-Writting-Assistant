"""Orchestrate skill prompt → model stream → session message updates."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, Optional

from app.services import prompt_builder, session_store, skill_loader
from app.services.model_client import ModelClientError, build_client
from app.services.project_store import project_exists


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


def iter_generate(
    project_id: str,
    *,
    session_id: str,
    skill_name: str,
    chapter_id: Optional[str] = None,
    current_content: str = "",
    selected_text: str = "",
    user_input: str = "",
    chapter_rules: str = "",
    model: Optional[str] = None,
) -> Iterator[str]:
    """
    Yield SSE frames for one generation turn.

    Frames:
      {"type":"meta", session_id, user_message_id, assistant_message_id, skill_name}
      {"type":"content","content":"..."}
      {"type":"error","error":"..."}
      [DONE]
    Reserved for later: {"type":"ask", ...}
    """
    if not project_exists(project_id):
        yield _sse({"type": "error", "error": f"项目不存在: {project_id}"})
        yield _sse_done()
        return

    skill = skill_loader.get_skill(skill_name)
    if skill is None:
        yield _sse({"type": "error", "error": f"Skill not found: {skill_name}"})
        yield _sse_done()
        return

    try:
        session_store.get_session(project_id, session_id)
    except FileNotFoundError:
        yield _sse({"type": "error", "error": f"会话不存在: {session_id}"})
        yield _sse_done()
        return

    text = (user_input or "").strip() or f"使用「{skill_name}」"
    user_msg = session_store.make_message("user", text)
    assistant_msg = session_store.make_message(
        "assistant",
        "",
        skill=skill_name,
        pending=True,
    )

    try:
        session_store.append_messages(
            project_id,
            session_id,
            [user_msg, assistant_msg],
            title_if_empty=text,
            status="generating",
        )
    except (FileNotFoundError, ValueError, OSError) as exc:
        yield _sse({"type": "error", "error": str(exc)})
        yield _sse_done()
        return

    yield _sse(
        {
            "type": "meta",
            "session_id": session_id,
            "user_message_id": user_msg["id"],
            "assistant_message_id": assistant_msg["id"],
            "skill_name": skill_name,
        }
    )

    try:
        system, user = prompt_builder.build_from_project(
            skill_name,
            project_id,
            chapter_id=chapter_id,
            current_content=current_content or "",
            selected_text=selected_text or "",
            user_input=text,
            chapter_rules=chapter_rules or "",
        )
    except FileNotFoundError as exc:
        _finalize_error(
            project_id, session_id, assistant_msg["id"], str(exc)
        )
        yield _sse({"type": "error", "error": str(exc)})
        yield _sse_done()
        return
    except ValueError as exc:
        _finalize_error(
            project_id, session_id, assistant_msg["id"], str(exc)
        )
        yield _sse({"type": "error", "error": str(exc)})
        yield _sse_done()
        return

    overrides: dict[str, Any] = {}
    if model and str(model).strip():
        overrides["model"] = str(model).strip()

    client = build_client(overrides or None)
    parts: list[str] = []
    errored = False

    try:
        for chunk in client.generate_stream(
            system=system,
            messages=[{"role": "user", "content": user}],
        ):
            parts.append(chunk)
            yield _sse({"type": "content", "content": chunk})
    except ModelClientError as exc:
        errored = True
        err_text = exc.message
        partial = "".join(parts)
        content = partial if partial else ""
        try:
            session_store.update_message(
                project_id,
                session_id,
                assistant_msg["id"],
                content=content,
                pending=False,
                error=err_text,
                status="idle",
            )
        except (FileNotFoundError, OSError):
            pass
        yield _sse({"type": "error", "error": err_text})
    except GeneratorExit:
        # Client aborted / disconnected: persist partial if any.
        partial = "".join(parts)
        try:
            session_store.update_message(
                project_id,
                session_id,
                assistant_msg["id"],
                content=partial,
                pending=False,
                error="已中断" if not partial else "",
                status="idle",
            )
        except (FileNotFoundError, OSError):
            pass
        raise
    except Exception as exc:  # noqa: BLE001 — surface unexpected failures on the stream
        errored = True
        err_text = str(exc) or "生成失败"
        try:
            session_store.update_message(
                project_id,
                session_id,
                assistant_msg["id"],
                content="".join(parts),
                pending=False,
                error=err_text,
                status="idle",
            )
        except (FileNotFoundError, OSError):
            pass
        yield _sse({"type": "error", "error": err_text})

    if not errored:
        full = "".join(parts)
        try:
            session_store.update_message(
                project_id,
                session_id,
                assistant_msg["id"],
                content=full,
                pending=True,  # awaiting user apply/discard in UI
                error="",
                status="idle",
            )
        except (FileNotFoundError, OSError):
            pass

    yield _sse_done()


def _finalize_error(
    project_id: str,
    session_id: str,
    assistant_message_id: str,
    error: str,
) -> None:
    try:
        session_store.update_message(
            project_id,
            session_id,
            assistant_message_id,
            content="",
            pending=False,
            error=error,
            status="idle",
        )
    except (FileNotFoundError, OSError):
        pass
