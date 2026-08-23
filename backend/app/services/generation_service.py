"""Orchestrate router / chat / skill → model stream → session + run ledger."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from typing import Any, Optional

from app.config import load_config
from app.services import (
    agent_tools,
    context_budget,
    prompt_builder,
    run_store,
    session_store,
    skill_loader,
)
from app.services.model_client import (
    ModelClientError,
    build_client,
    message_has_tool_calls,
)
from app.services.project_store import project_exists

SUMMARY_SYSTEM = (
    "你是会话摘要助手。将旧对话压缩为简洁中文摘要，供后续轮次使用。"
    "必须保留：已定调的情节/文风、已否决的方向、用户明确约束与关键设定结论。"
    "不要续写正文；不要超过 400 字。"
)

AGENT_SYSTEM = (
    "你是本地小说创作智能体。你拥有读取项目上下文的工具（章节、前文、大纲、记忆）。\n"
    "规则：\n"
    "1. 需要项目信息时先调用相应工具读取，不要凭空编造设定。\n"
    "2. 用户明显想让你续写/润色/扩写正文时，先读取必要章节，再输出可直接使用的正文。\n"
    "3. 用户只是在讨论/提问/闲聊时，不要输出大段正文，直接以简洁中文回复。\n"
    "4. 读取结果应精简；若已足够，直接作答。"
)

# Tools loop safety / draft heuristics.
MAX_TOOL_ROUNDS = 3
DRAFT_PROSE_MIN_CHARS = 400
DRAFT_PRESETS = {"续写", "润色", "扩写"}
BUBBLE_PRESETS = {"生成设定"}


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


USER_INPUT_PREVIEW_LEN = 200


def _skill_kind(name: str) -> str:
    if not name:
        return ""
    skill = skill_loader.get_skill(name)
    return str((skill or {}).get("kind") or "")


def _skill_source(*, explicit: bool, skill_name: str) -> str:
    if not skill_name:
        return ""
    return "explicit" if explicit else "router"


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
    Yield SSE frames for one agentic generation turn.

    Frames:
      {"type":"meta", session_id, user_message_id, assistant_message_id,
       mode:"agent", skill_name, preset, draft:bool}
      {"type":"tool_progress","tools":[{name, arguments}]}   # per tool round
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

    preset = (skill_name or "").strip() or None
    if preset is not None and skill_loader.get_skill(preset) is None:
        yield _sse({"type": "error", "error": f"Skill not found: {preset}"})
        yield _sse_done()
        return

    steps: list[dict[str, Any]] = []
    run_id = run_store.new_run_id()

    text = (user_input or "").strip()
    if not text:
        if preset:
            text = f"使用「{preset}」"
        else:
            text = "（空输入）"

    # --- Router: for free text, let the model pick a skill from the
    # auto-invocable catalog, else fall through to the generic chat path. ---
    preset_is_router = False
    router_step: Optional[dict[str, Any]] = None
    if preset is None:
        candidates = skill_loader.list_skills(include_auto_invocable_only=True)
        allowed = {str(c.get("name") or "").strip() for c in candidates if c.get("name")}
        if allowed:  # nothing to route to -> skip the model call, go chat
            t0 = time.perf_counter()
            router_sys, router_user = prompt_builder.build_router_prompt(
                project_id,
                session=session,
                user_input=text,
                chapter_id=chapter_id,
                current_content=current_content or "",
                chapter_rules=chapter_rules or "",
                candidate_skills=candidates,
            )
            try:
                raw = client.generate(
                    system=router_sys,
                    messages=[{"role": "user", "content": router_user}],
                    params={"max_tokens": 120, "temperature": 0.0},
                )
                decision = prompt_builder.parse_router_response(
                    raw, allowed_names=allowed
                )
            except ModelClientError:
                decision = {
                    "decision": "chat",
                    "skill_name": "",
                    "reason": "router_error",
                }
            latency = int((time.perf_counter() - t0) * 1000)

            if (
                decision.get("decision") == "skill"
                and decision.get("skill_name") in allowed
            ):
                preset = decision["skill_name"]
                preset_is_router = True

            router_step = run_store.make_step(
                "router",
                skill_name=preset if preset_is_router else "",
                skill_kind=_skill_kind(preset) if preset_is_router else "",
                skill_source="router",
                candidate_skills=sorted(allowed),
                system=router_sys,
                user=router_user,
                response=(decision.get("reason") or ""),
                latency_ms=latency,
                extra={
                    "decision": decision.get("decision", "chat"),
                    "reason": decision.get("reason", ""),
                },
            )
            steps.append(router_step)  # first step, so the viewer shows it on top

    # Snapshot before append so history does not duplicate this turn.
    session_for_prompt = session

    # --- Build THIN prompt (system + rules + user), no heavy context ---
    budget_report: dict[str, Any] = {}
    system = AGENT_SYSTEM
    intent = prompt_builder.preset_intent(preset) if preset else ""
    if intent:
        system = f"{system}\n\n【当前任务预设】\n{intent}"

    try:
        rules = prompt_builder.build_rules_block(project_id, chapter_rules or "")
        system = f"{system}\n\n【项目规则】\n{rules}"
        user = prompt_builder.build_thin_user(
            project_id,
            chapter_id=chapter_id,
            current_content=current_content or "",
            selected_text=selected_text or "",
            user_input=text,
            chapter_rules=chapter_rules or "",
        )
    except FileNotFoundError as exc:
        yield _sse({"type": "error", "error": str(exc)})
        yield _sse_done()
        return

    # History: presets must not let chat history dominate the prose; free text
    # keeps the full recent rounds for multi-turn discussion.
    if preset:
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
        history = prompt_builder.build_history_block(session_for_prompt)
        system, user, history, _n, budget_report = context_budget.apply_budget(
            system=system,
            user=user,
            history_text=history,
            conversation_note="",
            context_window=context_window,
            protect_user_body=False,
        )
        user = prompt_builder.merge_history_into_user(history, user)

    # --- Persist user + pending assistant ---
    skill_label = preset or "Agent"
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

    # Emit the meta frame so the frontend can map message ids. Draft is decided
    # from preset upfront; it is re-emitted with the final value after routing.
    yield _sse(
        {
            "type": "meta",
            "session_id": session_id,
            "user_message_id": user_msg["id"],
            "assistant_message_id": assistant_msg["id"],
            "mode": "agent",
            "skill_name": preset or "",
            "preset": preset or "",
            "draft": _preset_draft(preset),
        }
    )

    # --- Agentic tool loop ---
    messages: list[dict[str, Any]] = [{"role": "user", "content": user}]
    tools_enabled = bool(cfg.get("enable_agent_tools", True))
    tool_rounds = 0
    reads_work = False
    tool_called = False
    t1 = time.perf_counter()
    errored = False
    parts: list[str] = []
    tool_steps: list[dict[str, Any]] = []

    try:
        if tools_enabled:
            while True:
                t0 = time.perf_counter()
                assistant = client.chat(
                    system=system,
                    messages=messages,
                    tools=agent_tools.TOOLS,
                    tool_choice="auto",
                    params={"max_tokens": 256, "temperature": 0.4},
                )
                tool_calls = assistant.get("tool_calls") or []
                tool_steps.append(
                    run_store.make_step(
                        "agent_tool",
                        skill_name=preset or "",
                        skill_kind=_skill_kind(preset) if preset else "",
                        skill_source=_skill_source(explicit=not preset_is_router, skill_name=preset),
                        tools=tool_calls,
                        system=system,
                        user=messages[-1].get("content") or "",
                        response=assistant.get("content") or "",
                        budget_report=budget_report,
                        latency_ms=int((time.perf_counter() - t0) * 1000),
                    )
                )
                if not message_has_tool_calls(assistant):
                    break
                if tool_rounds >= MAX_TOOL_ROUNDS:
                    messages.append(
                        {
                            "role": "user",
                            "content": "请基于已读取的信息直接作答，不要再调用工具。",
                        }
                    )
                    break

                # Execute tools and append to the conversation.
                messages.append(
                    {
                        "role": "assistant",
                        "content": assistant.get("content") or None,
                        "tool_calls": tool_calls,
                    }
                )
                tool_called = True
                progress: list[dict[str, Any]] = []
                for tc in tool_calls:
                    if not isinstance(tc, dict):
                        continue
                    fn = tc.get("function") or {}
                    if not isinstance(fn, dict):
                        fn = {}
                    name = str(fn.get("name") or "")
                    args = _parse_tool_arguments(fn.get("arguments"))
                    # The tool message MUST reference the upstream call id
                    # (e.g. "call_xxx"), not the function name; otherwise the
                    # next chat call is rejected with a tool_calls mismatch.
                    result = agent_tools.execute_tool(
                        project_id,
                        name,
                        args,
                        tool_call_id=str(tc.get("id") or ""),
                    )
                    if name in {"read_chapter", "read_recent_work"}:
                        reads_work = True
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": result["tool_call_id"],
                            "content": result["content"],
                        }
                    )
                    progress.append(
                        {
                            "name": name,
                            "arguments": agent_tools.serialize_arguments(
                                name, args
                            ),
                        }
                    )
                tool_rounds += 1
                yield _sse({"type": "tool_progress", "tools": progress})
    except ModelClientError as exc:
        # Model / provider may not support function calling → fall back to a
        # thin single-turn stream without tools.
        if tool_steps or (tools_enabled and _tools_supported_error(exc)):
            tools_enabled = False
        else:
            errored = True
            err_text = exc.message
            try:
                session_store.update_message(
                    project_id,
                    session_id,
                    assistant_msg["id"],
                    content="",
                    pending=False,
                    error=err_text,
                    status="idle",
                )
            except (FileNotFoundError, OSError):
                pass
            steps.extend(tool_steps)
            _try_save_run(
                project_id,
                session_id=session_id,
                run_id=run_id,
                model_name=model_name,
                user_input=text,
                steps=steps + [run_store.make_step("agent", skill_name=preset or "",
                    system=system, user=user, response="", budget_report=budget_report,
                    latency_ms=int((time.perf_counter() - t1) * 1000), extra={"error": True})],
            )
            yield _sse({"type": "error", "error": err_text})
            yield _sse_done()
            return

    # --- Final streaming generation ---
    final_messages = messages
    try:
        for delta in client.chat_stream(
            system=system,
            messages=final_messages,
            params={},
        ):
            if delta.get("type") == "content":
                text_delta = delta.get("text") or ""
                parts.append(text_delta)
                yield _sse({"type": "content", "content": text_delta})
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
        steps.extend(tool_steps)
        steps.append(
            run_store.make_step(
                "agent",
                skill_name=preset or "",
                skill_kind=_skill_kind(preset) if preset else "",
                skill_source=_skill_source(explicit=not preset_is_router, skill_name=preset),
                tools=[],
                system=system,
                user=user,
                response=partial,
                budget_report=budget_report,
                latency_ms=int((time.perf_counter() - t1) * 1000),
                extra={"aborted": True},
            )
        )
        _try_save_run(
            project_id,
            session_id=session_id,
            run_id=run_id,
            model_name=model_name,
            user_input=text,
            steps=steps,
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

    # --- Draft vs bubble routing (no separate Router call) ---
    draft = _decide_draft(
        preset=preset,
        reads_work=reads_work,
        content=full,
        tool_calls_requested=tool_called,
    )
    # Emit final meta so the frontend can open/close the aiDraft card with the
    # resolved routing decision (length heuristic needs the full streamed text).
    yield _sse(
        {
            "type": "meta",
            "session_id": session_id,
            "user_message_id": user_msg["id"],
            "assistant_message_id": assistant_msg["id"],
            "mode": "agent",
            "skill_name": preset or "",
            "preset": preset or "",
            "draft": draft,
        }
    )

    if not errored:
        pending = draft
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

    steps.extend(tool_steps)
    steps.append(
        run_store.make_step(
            "agent",
            skill_name=preset or "",
            skill_kind=_skill_kind(preset) if preset else "",
            skill_source=_skill_source(explicit=not preset_is_router, skill_name=preset),
            tools=[],
            system=system,
            user=user,
            response=full,
            budget_report=budget_report,
            latency_ms=int((time.perf_counter() - t1) * 1000),
            extra={"error": errored, "draft": draft},
        )
    )

    if not errored:
        summary_step = _maybe_refresh_summary(project_id, session_id, client)
        if summary_step:
            steps.append(summary_step)

    _try_save_run(
        project_id,
        session_id=session_id,
        run_id=run_id,
        model_name=model_name,
        user_input=text,
        steps=steps,
    )

    yield _sse_done()


def _parse_tool_arguments(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _tools_supported_error(exc: ModelClientError) -> bool:
    """Heuristic: whether a model error indicates tools are unsupported.

    Treat connection / auth / generic failures as NOT tools-related (don't mask
    them); only blank out tools on explicit tool/parameter errors if any. Since
    most providers error on the payload only when tools are malformed, we keep
    this conservative — a plain failure falls back to streaming without tools.
    """
    msg = (getattr(exc, "message", "") or "").lower()
    return "tool" in msg or "function" in msg or "parameter" in msg


def _preset_draft(preset: Optional[str]) -> bool:
    """Draft decision from preset alone (upfront, before any model call)."""
    if preset:
        if preset in DRAFT_PRESETS:
            return True
        if preset in BUBBLE_PRESETS:
            return False
    return False


def _decide_draft(
    *,
    preset: Optional[str],
    reads_work: bool,
    content: str,
    tool_calls_requested: bool,
) -> bool:
    """Decide whether this turn's output is prose (aiDraft) or a chat bubble.

    Reuses the first agentic result — no extra model call. Reads-work implies
    the model is continuing/revising prose, so it is a sufficient draft signal
    (available before streaming). Free-text turns without tool calls fall back
    to a content-length heuristic once the streamed text is known.
    """
    if preset:
        if preset in DRAFT_PRESETS:
            return True
        if preset in BUBBLE_PRESETS:
            return False
    if reads_work:
        return True
    if not tool_calls_requested and len(content) > DRAFT_PROSE_MIN_CHARS:
        return True
    return False


def _try_save_run(
    project_id: str,
    *,
    session_id: str,
    run_id: str,
    model_name: str,
    steps: list[dict[str, Any]],
    user_input: str = "",
) -> None:
    preview = (user_input or "").strip()
    if len(preview) > USER_INPUT_PREVIEW_LEN:
        preview = preview[:USER_INPUT_PREVIEW_LEN]
    try:
        run_store.save_run(
            project_id,
            session_id=session_id,
            model=model_name,
            steps=steps,
            run_id=run_id,
            extra={"user_input": preview},
        )
    except (FileNotFoundError, OSError, TypeError, ValueError):
        pass


def _maybe_refresh_summary(
    project_id: str,
    session_id: str,
    client: Any,
) -> Optional[dict[str, Any]]:
    try:
        session = session_store.get_session(project_id, session_id)
    except FileNotFoundError:
        return None
    if not session_store.should_refresh_summary(session):
        return None

    messages = session.get("messages") or []
    older, _recent = session_store.messages_for_history(messages)
    if not older:
        return None

    prev_summary = str(session.get("summary") or "").strip()
    folded = session_store.format_messages_for_summary(older)
    user_prompt = (
        (f"已有摘要：\n{prev_summary}\n\n" if prev_summary else "")
        + f"待压缩的旧对话：\n{folded}\n\n请输出更新后的摘要："
    )
    t0 = time.perf_counter()
    fallback = False
    try:
        new_summary = client.generate(
            system=SUMMARY_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
            params={"max_tokens": 512, "temperature": 0.3},
        )
        new_summary = (new_summary or "").strip()
        if not new_summary:
            new_summary = _fallback_summary(prev_summary, folded)
            fallback = True
    except ModelClientError:
        new_summary = _fallback_summary(prev_summary, folded)
        fallback = True

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

    return run_store.make_step(
        "summary",
        tools=[],
        system=SUMMARY_SYSTEM,
        user=user_prompt,
        response=new_summary,
        latency_ms=int((time.perf_counter() - t0) * 1000),
        extra={"fallback": fallback},
    )


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
