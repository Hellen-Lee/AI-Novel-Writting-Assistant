"""Orchestrate router / chat / skill → model stream → session + run ledger."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from typing import Any, Optional

from app.config import load_config
from app.services import (
    context_budget,
    prompt_builder,
    run_store,
    session_store,
    skill_loader,
)
from app.services.model_client import ModelClientError, build_client
from app.services.project_store import project_exists

SUMMARY_SYSTEM = (
    "你是会话摘要助手。将旧对话压缩为简洁中文摘要，供后续轮次使用。"
    "必须保留：已定调的情节/文风、已否决的方向、用户明确约束与关键设定结论。"
    "不要续写正文；不要超过 400 字。"
)


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


def iter_generate(
    project_id: str,
    *,
    session_id: str,
    skill_name: Optional[str] = None,
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
      {"type":"router_meta", decision, skill_name?, reason?}   # when auto-routed
      {"type":"meta", session_id, user_message_id, assistant_message_id, mode, skill_name}
      {"type":"content","content":"..."}
      {"type":"error","error":"..."}
      [DONE]
    Reserved: {"type":"ask", ...}
    """
    if not project_exists(project_id):
        yield _sse({"type": "error", "error": f"项目不存在: {project_id}"})
        yield _sse_done()
        return

    try:
        session = session_store.get_session(project_id, session_id)
    except FileNotFoundError:
        yield _sse({"type": "error", "error": f"会话不存在: {session_id}"})
        yield _sse_done()
        return

    overrides: dict[str, Any] = {}
    if model and str(model).strip():
        overrides["model"] = str(model).strip()
    client = build_client(overrides or None)
    cfg = load_config()
    model_name = str(overrides.get("model") or cfg.get("model") or "")
    context_window = int(cfg.get("context_window") or 131_072)

    explicit_skill = (skill_name or "").strip() or None
    mode = "skill"
    resolved_skill = explicit_skill or ""
    router_decision = ""
    router_reason = ""
    steps: list[dict[str, Any]] = []
    run_id = run_store.new_run_id()

    text = (user_input or "").strip()
    if not text:
        if resolved_skill:
            text = f"使用「{resolved_skill}」"
        else:
            text = "（空输入）"

    # --- Router when skill_name omitted ---
    if not explicit_skill:
        candidates = skill_loader.list_skills(include_auto_invocable_only=True)
        allowed = {str(s.get("name") or "") for s in candidates if s.get("name")}
        r_system, r_user = prompt_builder.build_router_prompt(
            project_id,
            session=session,
            user_input=text,
            chapter_id=chapter_id,
            current_content=current_content or "",
            chapter_rules=chapter_rules or "",
            candidate_skills=candidates,
        )
        r_system, r_user, _hist, _note, r_budget = context_budget.apply_budget(
            system=r_system,
            user=r_user,
            history_text="",
            conversation_note="",
            context_window=context_window,
            protect_user_body=False,
        )
        t0 = time.perf_counter()
        router_raw = ""
        try:
            router_raw = client.generate(
                system=r_system,
                messages=[{"role": "user", "content": r_user}],
                params={"max_tokens": 256, "temperature": 0.2},
            )
        except ModelClientError as exc:
            router_raw = ""
            router_decision = "chat"
            router_reason = f"router_error:{exc.message}"
        else:
            parsed = prompt_builder.parse_router_response(
                router_raw, allowed_names=allowed
            )
            router_decision = parsed["decision"]
            router_reason = parsed.get("reason") or ""
            if router_decision == "skill" and parsed.get("skill_name"):
                resolved_skill = parsed["skill_name"]
                mode = "skill"
            else:
                # clarify → chat path with clarify hint
                mode = "chat"
                resolved_skill = ""

        steps.append(
            run_store.make_step(
                "router",
                system=r_system,
                user=r_user,
                response=router_raw,
                budget_report=r_budget,
                latency_ms=int((time.perf_counter() - t0) * 1000),
                extra={
                    "decision": router_decision or "chat",
                    "skill_name": resolved_skill,
                    "reason": router_reason,
                },
            )
        )
        yield _sse(
            {
                "type": "router_meta",
                "decision": router_decision or "chat",
                "skill_name": resolved_skill or None,
                "reason": router_reason or None,
            }
        )
    else:
        if skill_loader.get_skill(explicit_skill) is None:
            yield _sse({"type": "error", "error": f"Skill not found: {explicit_skill}"})
            yield _sse_done()
            return
        mode = "skill"
        resolved_skill = explicit_skill

    clarify = router_decision == "clarify"
    # Snapshot before append so history does not duplicate this turn
    session_for_prompt = session

    # --- Persist user + pending assistant ---
    skill_label = (
        resolved_skill
        if mode == "skill"
        else ("澄清" if clarify else "闲聊")
    )
    user_msg = session_store.make_message("user", text)
    assistant_msg = session_store.make_message(
        "assistant",
        "",
        skill=skill_label,
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
            "mode": mode,
            "skill_name": resolved_skill or "",
        }
    )

    # --- Build execution prompt ---
    budget_report: dict[str, Any] = {}
    system = ""
    user = ""
    try:
        if mode == "skill":
            system, user = prompt_builder.build_from_project(
                resolved_skill,
                project_id,
                chapter_id=chapter_id,
                current_content=current_content or "",
                selected_text=selected_text or "",
                user_input=text,
                chapter_rules=chapter_rules or "",
            )
            note = prompt_builder.conversation_note_from_session(session_for_prompt)
            system, user, _h, note, budget_report = context_budget.apply_budget(
                system=system,
                user=user,
                history_text="",
                conversation_note=note,
                context_window=context_window,
                protect_user_body=True,
            )
            user = prompt_builder.append_conversation_note(user, note)
        else:
            system, user_core, history = prompt_builder.build_chat_prompt(
                project_id,
                session=session_for_prompt,
                user_input=text,
                chapter_id=chapter_id,
                current_content=current_content or "",
                chapter_rules=chapter_rules or "",
                clarify=clarify,
            )
            system, user_core, history, _n, budget_report = context_budget.apply_budget(
                system=system,
                user=user_core,
                history_text=history,
                conversation_note="",
                context_window=context_window,
                protect_user_body=False,
            )
            user = prompt_builder.merge_history_into_user(history, user_core)
    except FileNotFoundError as exc:
        _finalize_error(project_id, session_id, assistant_msg["id"], str(exc))
        yield _sse({"type": "error", "error": str(exc)})
        yield _sse_done()
        return
    except ValueError as exc:
        _finalize_error(project_id, session_id, assistant_msg["id"], str(exc))
        yield _sse({"type": "error", "error": str(exc)})
        yield _sse_done()
        return

    parts: list[str] = []
    errored = False
    t1 = time.perf_counter()

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
        try:
            session_store.update_message(
                project_id,
                session_id,
                assistant_msg["id"],
                content=partial if partial else "",
                pending=False,
                error=err_text,
                status="idle",
            )
        except (FileNotFoundError, OSError):
            pass
        yield _sse({"type": "error", "error": err_text})
    except GeneratorExit:
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
        _try_save_run(
            project_id,
            session_id=session_id,
            run_id=run_id,
            model_name=model_name,
            steps=steps
            + [
                run_store.make_step(
                    mode,
                    skill_name=resolved_skill,
                    system=system,
                    user=user,
                    response=partial,
                    budget_report=budget_report,
                    latency_ms=int((time.perf_counter() - t1) * 1000),
                    extra={"aborted": True},
                )
            ],
        )
        raise
    except Exception as exc:  # noqa: BLE001
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

    full = "".join(parts)
    if not errored:
        # chat: pending=false (no draft apply); skill: pending=true for UI adopt/discard
        pending = mode == "skill"
        try:
            session_store.update_message(
                project_id,
                session_id,
                assistant_msg["id"],
                content=full,
                pending=pending,
                error="",
                skill=skill_label,
                status="idle",
            )
        except (FileNotFoundError, OSError):
            pass

    steps.append(
        run_store.make_step(
            mode,
            skill_name=resolved_skill,
            system=system,
            user=user,
            response=full,
            budget_report=budget_report,
            latency_ms=int((time.perf_counter() - t1) * 1000),
            extra={"error": errored},
        )
    )
    _try_save_run(
        project_id,
        session_id=session_id,
        run_id=run_id,
        model_name=model_name,
        steps=steps,
    )

    if not errored:
        _maybe_refresh_summary(project_id, session_id, client)

    yield _sse_done()


def _try_save_run(
    project_id: str,
    *,
    session_id: str,
    run_id: str,
    model_name: str,
    steps: list[dict[str, Any]],
) -> None:
    try:
        run_store.save_run(
            project_id,
            session_id=session_id,
            model=model_name,
            steps=steps,
            run_id=run_id,
        )
    except (FileNotFoundError, OSError, TypeError, ValueError):
        pass


def _maybe_refresh_summary(
    project_id: str,
    session_id: str,
    client: Any,
) -> None:
    try:
        session = session_store.get_session(project_id, session_id)
    except FileNotFoundError:
        return
    if not session_store.should_refresh_summary(session):
        return

    messages = session.get("messages") or []
    older, _recent = session_store.messages_for_history(messages)
    if not older:
        return

    prev_summary = str(session.get("summary") or "").strip()
    folded = session_store.format_messages_for_summary(older)
    user_prompt = (
        (f"已有摘要：\n{prev_summary}\n\n" if prev_summary else "")
        + f"待压缩的旧对话：\n{folded}\n\n请输出更新后的摘要："
    )
    try:
        new_summary = client.generate(
            system=SUMMARY_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
            params={"max_tokens": 512, "temperature": 0.3},
        )
        new_summary = (new_summary or "").strip()
        if not new_summary:
            new_summary = _fallback_summary(prev_summary, folded)
    except ModelClientError:
        new_summary = _fallback_summary(prev_summary, folded)

    rounds = session_store.count_rounds(messages)
    try:
        session_store.update_session_fields(
            project_id,
            session_id,
            summary=new_summary,
            summary_at_round_count=rounds,
        )
    except (FileNotFoundError, OSError):
        pass


def _fallback_summary(prev: str, folded: str) -> str:
    blob = (prev + "\n" + folded).strip()
    if len(blob) > 800:
        return blob[:780] + "…（截断摘要）"
    return blob or "（无摘要）"


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
