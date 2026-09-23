"""Orchestrate router / chat / skill → model stream → session + run ledger."""

from __future__ import annotations

import json
import re
import time
from collections.abc import Iterator
from string import Template
from typing import Any, Optional

from app.config import load_config
from app.services import (
    agent_tools,
    context_budget,
    attachment_store,
    prompt_builder,
    reasoning_store,
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
from app.services import prompt_loader

SUMMARY_SYSTEM = prompt_loader.get("summary_system")
AGENT_SYSTEM = prompt_loader.get("agent_system")

# Tools loop safety / draft heuristics.
MAX_TOOL_ROUNDS = 3
# 工具决策轮的输出预算。注意：推理类模型（如 deepseek-v4-flash）会先消耗大量
# reasoning token 再产出 tool_calls/content，预算过小会被整体截断，表现为
# content 与 tool_calls 同时为空（模型"什么都没说"），工具链路随机失效。
# 1024 足以覆盖常规推理开销，且本轮只做工具决策，正文由下一轮流式生成。
TOOL_ROUND_MAX_TOKENS = 1024
# 路由决策与会话摘要同样会被推理 token 挤占，预算需大于常规输出量级。
ROUTER_MAX_TOKENS = 1024
SUMMARY_MAX_TOKENS = 2048
DRAFT_PROSE_MIN_CHARS = 400
DRAFT_PRESETS = {"续写", "润色", "扩写"}
BUBBLE_PRESETS = {"生成设定"}
# 最终流式返回空内容时给用户的提示
EMPTY_RESULT_MESSAGE = "模型未返回任何内容，请重试或调整输入"


def _attachment_summary(record: dict[str, Any]) -> dict[str, Any]:
    """生成轻量消息摘要，不把附件全文写入会话 JSON。"""
    parsed = record.get("parsed")
    parsed_summary: dict[str, Any] = {}
    if isinstance(parsed, dict):
        for key in ("kind", "text_truncated", "chars", "note", "width", "height", "thumb_rel"):
            if key in parsed:
                parsed_summary[key] = parsed[key]
    return {
        "id": str(record.get("id") or ""),
        "type": str(record.get("type") or ""),
        "name": str(record.get("name") or ""),
        "mime": str(record.get("mime") or ""),
        "size": int(record.get("size") or 0),
        "status": str(record.get("status") or ""),
        "parsed": parsed_summary,
    }


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
    content_anchor: Optional[dict] = None,
    attachments: Optional[list[str]] = None,
) -> Iterator[str]:
    """
    Yield SSE frames for one agentic generation turn.

    Frames:
      {"type":"meta", session_id, user_message_id, assistant_message_id,
       mode:"agent", skill_name, preset, draft:bool}
      {"type":"tool_progress","tools":[{name, arguments}]}   # per tool round
      {"type":"thinking","text":"..."}   # 推理模型思考增量；不进正文，可能穿插
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

    attachment_records: list[dict[str, Any]] = []
    attachment_ids = list(dict.fromkeys(str(item).strip() for item in (attachments or []) if str(item).strip()))
    if len(attachment_ids) > 5:
        yield _sse({"type": "error", "error": "单条消息最多携带 5 个附件"})
        yield _sse_done()
        return
    for att_id in attachment_ids:
        try:
            record = attachment_store.read_record(project_id, session_id, att_id)
        except (FileNotFoundError, ValueError):
            record = None
        if not record:
            yield _sse({"type": "error", "error": f"附件不存在或不属于当前会话: {att_id}"})
            yield _sse_done()
            return
        if record.get("status") != "ready":
            yield _sse({"type": "error", "error": f"附件解析失败，请先移除: {record.get('name') or att_id}"})
            yield _sse_done()
            return
        if attachment_store.original_path(project_id, session_id, record) is None:
            yield _sse({"type": "error", "error": f"附件文件已缺失: {record.get('name') or att_id}"})
            yield _sse_done()
            return
        attachment_records.append(record)

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
    reasoning_writer = reasoning_store.ReasoningWriter(project_id, run_id)

    text = (user_input or "").strip()
    if not text:
        yield _sse({"type": "error", "error": "请输入内容"})
        yield _sse_done()
        return

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
                    params={"max_tokens": ROUTER_MAX_TOKENS, "temperature": 0.0},
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
        base_user = prompt_builder.build_thin_user(
            project_id,
            chapter_id=chapter_id,
            current_content=current_content or "",
            selected_text=selected_text or "",
            user_input=text,
            chapter_rules=chapter_rules or "",
        )
        attachment_materials, degraded_attachment_indexes = (
            prompt_builder.fit_attachment_materials(
                attachment_records,
                system=system,
                base_user=base_user,
                context_window=context_window,
            )
        )
        user = prompt_builder.build_thin_user(
            project_id,
            chapter_id=chapter_id,
            current_content=current_content or "",
            selected_text=selected_text or "",
            user_input=text,
            chapter_rules=chapter_rules or "",
            attachments=attachment_materials,
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
    user_msg = session_store.make_message(
        "user",
        text,
        attachments=[_attachment_summary(record) for record in attachment_records],
        selection=(selected_text or "").strip(),
    )
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

    # 持久化最近一次上下文用量（估算入模 token vs 完整窗口），刷新/切回会话后仍可展示
    try:
        session_store.update_session_fields(
            project_id,
            session_id,
            context_usage={
                "used": int(budget_report.get("used_est", 0)),
                "window": int(context_window),
            },
        )
    except (FileNotFoundError, OSError, ValueError):
        pass  # 持久化为 best-effort，失败不阻塞生成

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
            "context_usage": {
                "used_est": int(budget_report.get("used_est", 0)),
                "window": int(context_window),
            },
        }
    )

    # --- Agentic tool loop ---
    messages: list[dict[str, Any]] = [{"role": "user", "content": user}]
    tools_enabled = bool(cfg.get("enable_agent_tools", True))
    tool_rounds = 0
    reads_work = False
    tool_called = False
    # 模型在工具轮直接给出正文（未调用工具）时保留，供最终流式为空时回退使用
    tool_answer = ""
    t1 = time.perf_counter()
    errored = False
    parts: list[str] = []
    # 本次 turn 的最终流 reasoning 直接增量写入 sidecar；
    # 不进正文（parts）或会话历史，step 仅保存预览和引用。
    tool_steps: list[dict[str, Any]] = []
    # 跨所有工具轮累积的工具调用（[{name, arguments(dict)}]），随消息落盘保留
    tools_called: list[dict[str, Any]] = []

    try:
        if tools_enabled:
            while True:
                t0 = time.perf_counter()
                assistant = client.chat(
                    system=system,
                    messages=messages,
                    tools=agent_tools.TOOLS,
                    tool_choice="auto",
                    params={
                        "max_tokens": TOOL_ROUND_MAX_TOKENS,
                        "temperature": 0.4,
                    },
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
                    # 模型未调用工具、直接作答：记录内容，下一轮流式可能重复生成，
                    # 若流式为空则回退到这里的结果，避免用户看到空白。
                    tool_answer = (assistant.get("content") or "").strip()
                    break
                if tool_rounds >= MAX_TOOL_ROUNDS:
                    messages.append(
                        {
                            "role": "user",
                            "content": prompt_loader.get("tool_loop_fallback"),
                        }
                    )
                    break

                # Execute tools and append to the conversation.
                assistant_message: dict[str, Any] = {
                    "role": "assistant",
                    "content": assistant.get("content") or None,
                    "tool_calls": tool_calls,
                }
                if "reasoning_content" in assistant:
                    # DeepSeek 等推理模型要求工具循环的后续请求回传
                    # reasoning_content；它只存在于本次 turn 的内存消息中。
                    assistant_message["reasoning_content"] = assistant.get(
                        "reasoning_content"
                    )
                messages.append(assistant_message)
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
                    # 落盘保留解析后的 dict（与 SSE 的字符串形态解耦）
                    tools_called.append({"name": name, "arguments": args})
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
                    tools=tools_called,
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
    agent_step_index = len(steps) + len(tool_steps)
    try:
        for delta in client.chat_stream(
            system=system,
            messages=final_messages,
            params={},
        ):
            if delta.get("type") == "reasoning":
                # 思考增量只透传给前端展示：不进 parts、不参与 draft 判定/
                # 锚哨兵解析/字数统计（计划书 0.3 总原则 2）。
                reasoning_text = delta.get("text") or ""
                reasoning_writer.append(agent_step_index, reasoning_text)
                yield _sse({"type": "thinking", "text": reasoning_text})
                continue
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
                tools=tools_called,
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
                tools=tools_called,
            )
        except (FileNotFoundError, OSError):
            pass
        steps.extend(tool_steps)
        aborted_extra: dict[str, Any] = {"aborted": True}
        reasoning_ref = reasoning_writer.finalize(agent_step_index)
        if reasoning_ref:
            aborted_extra["reasoning"] = reasoning_ref["preview"]
            aborted_extra["reasoning_ref"] = reasoning_ref
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
                extra=aborted_extra,
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
                tools=tools_called,
            )
        except (FileNotFoundError, OSError):
            pass
        yield _sse({"type": "error", "error": err_text})

    full = "".join(parts)

    # 流式为空时回退到工具轮已生成的正文（模型可能已在决策轮直接作答），
    # 避免用户看到一条空白消息。
    if not full.strip() and tool_answer:
        full = tool_answer
        yield _sse({"type": "content", "content": tool_answer})

    # 仍然为空：明确报错，而不是静默写入一条空消息
    if not full.strip() and not errored:
        errored = True
        err_text = EMPTY_RESULT_MESSAGE
        try:
            session_store.update_message(
                project_id,
                session_id,
                assistant_msg["id"],
                content="",
                pending=False,
                error=err_text,
                status="idle",
                tools=tools_called,
            )
        except (FileNotFoundError, OSError):
            pass
        yield _sse({"type": "error", "error": err_text})

    # --- Anchor: 段落级定位。若模型在末尾输出 [[ANCHOR|...]] 哨兵则解析并剥离，
    # 使 aiDraft 落位与正文替换有据可依；否则沿用前端选区透传的 content_anchor。 ---
    full, content_anchor = _resolve_content_anchor(
        full, requested_anchor=content_anchor
    )

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
            "content_anchor": content_anchor,
            "context_usage": {
                "used_est": int(budget_report.get("used_est", 0)),
                "window": int(context_window),
            },
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
                tools=tools_called,
            )
        except (FileNotFoundError, OSError):
            pass

    steps.extend(tool_steps)
    final_extra: dict[str, Any] = {
        "error": errored,
        "draft": draft,
        "attachments": [record.get("id") for record in attachment_records],
        "attachments_degraded": degraded_attachment_indexes,
    }
    reasoning_ref = reasoning_writer.finalize(agent_step_index)
    if reasoning_ref:
        # A3：思考文本只进 run_store（Agent Viewer 可回看），
        # 不进 session_store 消息（原则 0.3-1）。非推理模型无该字段。
        final_extra["reasoning"] = reasoning_ref["preview"]
        final_extra["reasoning_ref"] = reasoning_ref
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
            extra=final_extra,
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


# 模型在正文末尾单独一行输出锚定哨兵，供段落级定位/替换。
# 形态: [[ANCHOR|insert_after|5]]  或  [[ANCHOR|replace_range|1|5]]
_ANCHOR_SENTINEL_RE = re.compile(
    r"\[\[\s*ANCHOR\s*\|\s*(?P<mode>insert_after|replace_range)\s*\|"
    r"\s*(?P<start>\d+)(?:\s*\|\s*(?P<end>\d+))?\s*\]\]\s*$",
    re.IGNORECASE,
)


def _normalize_anchor(anchor: Any) -> Optional[dict]:
    """校验/归一化一个锚对象为 {mode,startPara,endPara}（正数）；非法返回 None。"""
    if not isinstance(anchor, dict):
        return None
    mode = str(anchor.get("mode") or "").strip()
    if mode not in ("insert_after", "replace_range"):
        return None
    start = anchor.get("startPara")
    end = anchor.get("endPara", start)
    try:
        start = int(start)
        end = int(end)
    except (TypeError, ValueError):
        return None
    if start < 1 or end < start:
        return None
    return {"mode": mode, "startPara": start, "endPara": end}


def _resolve_content_anchor(full: str, requested_anchor: Optional[dict]) -> tuple[str, Optional[dict]]:
    """从模型输出末尾解析锚定哨兵并剥离；否则沿用前端透传的选区锚。

    返回 (clean_full, anchor)。哨兵优先于请求锚（模型对自然语言"前五段"的推断
    应覆盖无选区时的默认），且哨兵剥离后正文不残留标记。
    """
    m = _ANCHOR_SENTINEL_RE.search(full)
    if m:
        start = int(m.group("start"))
        end = int(m.group("end")) if m.group("end") is not None else start
        mode = str(m.group("mode")).lower()
        clean = full[: m.start()].rstrip()
        anchor: Optional[dict] = {"mode": mode, "startPara": start, "endPara": end}
        return clean, anchor
    anchor = _normalize_anchor(requested_anchor)
    return full, anchor


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
    prev_summary_header = f"已有摘要：\n{prev_summary}\n\n" if prev_summary else ""
    user_prompt = Template(prompt_loader.get("summary_user")).safe_substitute(
        prev_summary_header=prev_summary_header, folded=folded
    )
    t0 = time.perf_counter()
    fallback = False
    try:
        new_summary = client.generate(
            system=SUMMARY_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
            params={"max_tokens": SUMMARY_MAX_TOKENS, "temperature": 0.3},
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
