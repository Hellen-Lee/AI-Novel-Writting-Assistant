"""Assemble prompts from SKILL.md templates and project context."""

from __future__ import annotations

import json
from string import Template
from typing import Any, Optional

from app.services import memory_store, project_store, session_store, skill_loader
from app.services.skill_loader import KIND_QUICK_ACTION, KIND_SKILL

# L0 / history defaults (see docs/build/07)
THIN_CHAPTER_TAIL_CHARS = 2000
THIN_GLOBAL_RULES_CHARS = 800
CONVERSATION_NOTE_MAX_CHARS = 500
HISTORY_KEEP_ROUNDS = session_store.HISTORY_KEEP_ROUNDS

CHAT_SYSTEM = (
    "你是本地小说创作助手。用简洁中文与用户讨论设定、情节与写法。"
    "不要擅自输出大段成章正文去替换章节，除非用户明确要求续写/润色类产出；"
    "若用户意图不清，先简短澄清。可提示对方使用快捷按钮或 /技能名。"
)

ROUTER_SYSTEM = (
    "你是路由助手。根据用户意图，在候选 skill 中选一个，或判定为闲聊/需澄清。"
    "只输出一个 JSON 对象，不要其它文字。格式：\n"
    '{"decision":"skill"|"chat"|"clarify","skill_name":"","reason":""}\n'
    "规则：\n"
    "- decision=skill 时 skill_name 必须是候选列表中的 name；\n"
    "- 无法匹配或只需讨论时用 chat；\n"
    "- 意图模糊时用 clarify；\n"
    "- 不要选择列表外的 skill。"
)


def _format_tags(tags: Any) -> str:
    if isinstance(tags, list) and tags:
        return " [" + ", ".join(str(t) for t in tags) + "]"
    return ""


def _format_memory_entries(entries: list[dict[str, Any]]) -> str:
    if not entries:
        return "（无）"
    lines: list[str] = []
    for entry in entries:
        name = str(entry.get("name") or "").strip() or "未命名"
        content = str(entry.get("content") or "").strip()
        tag_text = _format_tags(entry.get("tags"))
        if content:
            lines.append(f"- {name}{tag_text}：{content}")
        else:
            lines.append(f"- {name}{tag_text}")
    return "\n".join(lines)


def _format_characters(entries: list[dict[str, Any]]) -> str:
    """Format characters with profile + nested relationship list."""
    if not entries:
        return "（无）"
    lines: list[str] = []
    for entry in entries:
        name = str(entry.get("name") or "").strip() or "未命名"
        profile = str(entry.get("profile") or "").strip()
        # Tolerate legacy content field if present.
        if not profile:
            profile = str(entry.get("content") or "").strip()
        tag_text = _format_tags(entry.get("tags"))
        if profile:
            lines.append(f"- {name}{tag_text}：{profile}")
        else:
            lines.append(f"- {name}{tag_text}")

        rels = entry.get("relationship") or []
        if isinstance(rels, dict):
            rel_parts = [
                f"{str(k).strip()}→{str(v).strip()}"
                for k, v in rels.items()
                if str(k).strip() and str(v).strip()
            ]
        elif isinstance(rels, list):
            rel_parts = []
            for rel in rels:
                if not isinstance(rel, dict):
                    continue
                rel_type = str(rel.get("type") or "").strip()
                target = str(rel.get("target") or "").strip()
                if rel_type and target:
                    rel_parts.append(f"{rel_type}→{target}")
        else:
            rel_parts = []
        if rel_parts:
            lines.append("  关系：" + "；".join(rel_parts))
    return "\n".join(lines)


def _format_volumes(volumes: list[Any]) -> str:
    if not volumes:
        return "（无）"
    lines: list[str] = []
    for vol in volumes:
        if not isinstance(vol, dict):
            continue
        label = str(vol.get("label") or "").strip()
        name = str(vol.get("name") or "").strip()
        summary = str(vol.get("summary") or "").strip()
        title = " · ".join(p for p in (label, name) if p) or "未命名分卷"
        if summary:
            lines.append(f"- {title}：{summary}")
        else:
            lines.append(f"- {title}")
    return "\n".join(lines) if lines else "（无）"


def _format_previous_chapters(
    project_id: str,
    *,
    chapter_id: Optional[str] = None,
    limit: int = 3,
) -> str:
    chapters = project_store.list_chapters(project_id)
    if not chapters:
        return "（无）"

    if chapter_id:
        before = [c for c in chapters if c["order"] < _chapter_order(chapters, chapter_id)]
        selected = before[-limit:]
    else:
        selected = chapters[-limit:]

    if not selected:
        return "（无）"

    blocks: list[str] = []
    for chapter in selected:
        content = project_store.read_chapter_content(project_id, chapter["filename"])
        title = chapter.get("title") or chapter["id"]
        blocks.append(f"### {title}\n{content.strip() or '（空）'}")
    return "\n\n".join(blocks)


def _chapter_order(chapters: list[dict[str, Any]], chapter_id: str) -> int:
    for chapter in chapters:
        if chapter["id"] == chapter_id:
            return int(chapter["order"])
    return 10**9


def build_context(
    project_id: Optional[str] = None,
    *,
    chapter_id: Optional[str] = None,
    current_content: str = "",
    selected_text: str = "",
    user_input: str = "",
    chapter_rules: str = "",
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, str]:
    """Build string template variables for skill rendering."""
    global_rules = ""
    style_preference = ""
    worldview = "（无）"
    characters = "（无）"
    story_core = "（无）"
    synopsis = "（无）"
    volumes = "（无）"
    previous_chapters = "（无）"

    if project_id and project_store.project_exists(project_id):
        settings = project_store.load_settings(project_id)
        global_rules = str(settings.get("global_rules") or "")
        style_preference = str(settings.get("style_preference") or "")

        memory = memory_store.load_memory(project_id)
        worldview = _format_memory_entries(memory.get("worldview") or [])
        characters = _format_characters(memory.get("characters") or [])
        story_core = _format_memory_entries(memory.get("story_core") or [])
        previous_chapters = _format_previous_chapters(
            project_id, chapter_id=chapter_id, limit=3
        )

        outline = project_store.load_outline(project_id)
        synopsis_text = str(outline.get("synopsis") or "").strip()
        synopsis = synopsis_text or "（无）"
        volumes = _format_volumes(outline.get("volumes") or [])

        if not current_content and chapter_id:
            try:
                chapter = project_store.get_chapter(project_id, chapter_id)
                current_content = str(chapter.get("content") or "")
            except FileNotFoundError:
                pass

    context: dict[str, str] = {
        "global_rules": global_rules or "（无）",
        "style_preference": style_preference or "（无）",
        "chapter_rules": chapter_rules or "（无）",
        "worldview": worldview,
        "characters": characters,
        "story_core": story_core,
        "synopsis": synopsis,
        "volumes": volumes,
        # Deprecated aliases: old custom templates keep rendering instead of leaving $placeholders.
        "items": "（无）",
        "plot_points": "（无）",
        "relationships": "（无）",
        "previous_chapters": previous_chapters,
        "current_content": current_content or "（无）",
        "selected_text": selected_text or "（无）",
        "user_input": user_input or "（无）",
    }

    if extra:
        for key, value in extra.items():
            context[str(key)] = "" if value is None else str(value)

    return context


def render_user_template(template: str, context: dict[str, str]) -> str:
    return Template(template).safe_substitute(context)


def build(skill_name: str, context: dict[str, Any]) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for a skill name + variable map."""
    skill = skill_loader.get_skill(skill_name)
    if skill is None:
        raise ValueError(f"Skill not found: {skill_name}")

    str_context = {k: ("" if v is None else str(v)) for k, v in context.items()}
    user = render_user_template(skill["user_template"], str_context)

    kind = skill["kind"]
    if kind == KIND_QUICK_ACTION:
        system = skill.get("system") or ""
    elif kind == KIND_SKILL:
        system = ""
    else:
        raise ValueError(f"Unknown skill kind: {kind}")

    return system, user


def build_from_project(
    skill_name: str,
    project_id: str,
    *,
    chapter_id: Optional[str] = None,
    current_content: str = "",
    selected_text: str = "",
    user_input: str = "",
    chapter_rules: str = "",
    extra: Optional[dict[str, Any]] = None,
) -> tuple[str, str]:
    """Load project context, then build (system, user) for the skill."""
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    context = build_context(
        project_id,
        chapter_id=chapter_id,
        current_content=current_content,
        selected_text=selected_text,
        user_input=user_input,
        chapter_rules=chapter_rules,
        extra=extra,
    )
    return build(skill_name, context)


def _truncate(text: str, max_chars: int) -> str:
    text = text or ""
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    return text[: max_chars - 10] + "…（截断）"


def _chapter_title(
    project_id: str, chapter_id: Optional[str]
) -> str:
    if not chapter_id:
        return ""
    try:
        chapter = project_store.get_chapter(project_id, chapter_id)
        return str(chapter.get("title") or chapter_id)
    except FileNotFoundError:
        return chapter_id or ""


def build_thin_context(
    project_id: str,
    *,
    chapter_id: Optional[str] = None,
    current_content: str = "",
    chapter_rules: str = "",
    chapter_tail_chars: int = THIN_CHAPTER_TAIL_CHARS,
) -> str:
    """
    L0 thin project context for Router / chat.
    No full memory dump, no previous 3 chapters.
    """
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    meta = project_store.load_meta(project_id)
    settings = project_store.load_settings(project_id)
    name = str(meta.get("name") or "").strip() or "未命名项目"
    genre = str(meta.get("genre") or "").strip() or "（未设题材）"
    global_rules = _truncate(
        str(settings.get("global_rules") or "").strip(),
        THIN_GLOBAL_RULES_CHARS,
    ) or "（无）"
    style = str(settings.get("style_preference") or "").strip() or "（无）"

    content = current_content or ""
    if not content and chapter_id:
        try:
            chapter = project_store.get_chapter(project_id, chapter_id)
            content = str(chapter.get("content") or "")
        except FileNotFoundError:
            content = ""
    title = _chapter_title(project_id, chapter_id) or "（当前章）"
    tail = content[-chapter_tail_chars:] if content else "（空）"
    if content and len(content) > chapter_tail_chars:
        tail = "…（章末窗口）\n" + tail

    rules_line = (chapter_rules or "").strip() or "（无）"

    return (
        f"书名：{name}\n"
        f"题材：{genre}\n"
        f"全局规则摘要：{global_rules}\n"
        f"文风偏好：{style}\n"
        f"当前章：{title}\n"
        f"单章规则：{rules_line}\n"
        f"当前章末尾：\n{tail}"
    )


def build_rules_block(
    project_id: str,
    chapter_rules: str = "",
    *,
    global_rules_chars: int = THIN_GLOBAL_RULES_CHARS,
) -> str:
    """Rules-only system block: global_rules + style + chapter_rules.

    Contains NO memory / outline / chapters — the model fetches those via tools.
    """
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    settings = project_store.load_settings(project_id)
    global_rules = _truncate(
        str(settings.get("global_rules") or "").strip(),
        global_rules_chars,
    ) or "（无）"
    style = str(settings.get("style_preference") or "").strip() or "（无）"
    rules_line = (chapter_rules or "").strip() or "（无）"

    return (
        f"全局规则：{global_rules}\n"
        f"文风偏好：{style}\n"
        f"单章规则：{rules_line}"
    )


def build_thin_user(
    project_id: str,
    *,
    chapter_id: Optional[str] = None,
    current_content: str = "",
    selected_text: str = "",
    user_input: str = "",
    chapter_rules: str = "",
    chapter_tail_chars: int = THIN_CHAPTER_TAIL_CHARS,
) -> str:
    """Thin user context: book identity + current chapter tail + selection + input.

    No memory dump, no previous chapters, no full outline — the model pulls what
    it needs via tools. Uses the current-chapter tail window as a light anchor.
    """
    if not project_store.project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    meta = project_store.load_meta(project_id)
    name = str(meta.get("name") or "").strip() or "未命名项目"
    genre = str(meta.get("genre") or "").strip() or "（未设题材）"

    content = current_content or ""
    if not content and chapter_id:
        try:
            chapter = project_store.get_chapter(project_id, chapter_id)
            content = str(chapter.get("content") or "")
        except FileNotFoundError:
            content = ""
    title = _chapter_title(project_id, chapter_id) or "（当前章）"
    tail = content[-chapter_tail_chars:] if content else "（空）"
    if content and len(content) > chapter_tail_chars:
        tail = "…（章末窗口）\n" + tail

    parts = [
        f"书名：{name}",
        f"题材：{genre}",
        f"当前章：{title}",
        f"当前章末尾：\n{tail}",
    ]
    if selected_text:
        parts.append(f"选中文本：\n{selected_text}")
    parts.append("【用户本轮输入】\n" + ((user_input or "").strip() or "（空）"))
    return "\n\n".join(parts)


def preset_intent(preset_name: str) -> str:
    """Return a preset's intent text (its `system` frontmatter) for injection.

    Presets (续写/润色/扩写/生成设定) no longer render their full `$var`
    template; only their intent/rule text is appended to the agent system prompt.
    Falls back to the user_template for kind=skill presets with an empty system.
    """
    if not preset_name:
        return ""
    skill = skill_loader.get_skill(preset_name)
    if skill is None:
        return ""
    system = str(skill.get("system") or "").strip()
    if system:
        return system
    return str(skill.get("user_template") or "").strip()


def build_history_block(
    session: dict[str, Any],
    *,
    keep_rounds: int = HISTORY_KEEP_ROUNDS,
    include_pending: bool = False,
) -> str:
    """summary + recent K rounds (exclude empty pending assistant if desired)."""
    summary = str(session.get("summary") or "").strip()
    messages = session.get("messages") or []
    if not isinstance(messages, list):
        messages = []

    usable: list[dict[str, Any]] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        if not include_pending and msg.get("pending") and not str(msg.get("content") or "").strip():
            continue
        usable.append(msg)

    _older, recent = session_store.messages_for_history(
        usable, keep_rounds=keep_rounds
    )
    parts: list[str] = []
    if summary:
        parts.append("【对话摘要】\n" + summary)
    if recent:
        parts.append(
            "【最近对话】\n"
            + session_store.format_messages_for_summary(recent, max_chars=8000)
        )
    return "\n\n".join(parts) if parts else "（暂无历史）"


def conversation_note_from_session(
    session: dict[str, Any],
    *,
    max_chars: int = CONVERSATION_NOTE_MAX_CHARS,
) -> str:
    """Ultra-short note for skill path so chat history does not dominate."""
    summary = str(session.get("summary") or "").strip()
    if summary:
        return _truncate(summary, max_chars)
    _older, recent = session_store.messages_for_history(
        session.get("messages") or [], keep_rounds=2
    )
    if not recent:
        return ""
    return _truncate(
        session_store.format_messages_for_summary(recent, max_chars=max_chars),
        max_chars,
    )


def build_router_prompt(
    project_id: str,
    *,
    session: dict[str, Any],
    user_input: str,
    chapter_id: Optional[str] = None,
    current_content: str = "",
    chapter_rules: str = "",
    candidate_skills: Optional[list[dict[str, Any]]] = None,
) -> tuple[str, str]:
    thin = build_thin_context(
        project_id,
        chapter_id=chapter_id,
        current_content=current_content,
        chapter_rules=chapter_rules,
    )
    history = build_history_block(session)
    skills = candidate_skills
    if skills is None:
        skills = skill_loader.list_skills(include_auto_invocable_only=True)
    catalog_lines: list[str] = []
    for s in skills:
        name = str(s.get("name") or "").strip()
        desc = str(s.get("description") or "").strip()
        if name:
            catalog_lines.append(f"- {name}：{desc or '（无描述）'}")
    catalog = "\n".join(catalog_lines) if catalog_lines else "（无可自动调用的 skill）"

    user = (
        f"{thin}\n\n"
        f"{history}\n\n"
        f"【可自动调用的 skill】\n{catalog}\n\n"
        f"【用户本轮输入】\n{(user_input or '').strip() or '（空）'}\n\n"
        "请输出 JSON 决策。"
    )
    return ROUTER_SYSTEM, user


def build_chat_prompt(
    project_id: str,
    *,
    session: dict[str, Any],
    user_input: str,
    chapter_id: Optional[str] = None,
    current_content: str = "",
    chapter_rules: str = "",
    clarify: bool = False,
) -> tuple[str, str, str]:
    """
    Returns (system, user_without_history_merged, history_block).
    Caller may run budget on history separately then concatenate.
    """
    thin = build_thin_context(
        project_id,
        chapter_id=chapter_id,
        current_content=current_content,
        chapter_rules=chapter_rules,
    )
    history = build_history_block(session)
    clarify_hint = (
        "用户意图可能不清晰，请先用一两句澄清想做什么"
        "（续写 / 润色 / 讨论设定等），并可提示使用快捷按钮或 /技能名。\n\n"
        if clarify
        else ""
    )
    user_core = (
        f"{thin}\n\n"
        f"{clarify_hint}"
        f"【用户本轮输入】\n{(user_input or '').strip() or '（空）'}\n\n"
        "请回复用户。"
    )
    return CHAT_SYSTEM, user_core, history


def merge_history_into_user(history: str, user_core: str) -> str:
    hist = (history or "").strip()
    if not hist or hist == "（暂无历史）":
        return user_core
    return f"{hist}\n\n{user_core}"


def append_conversation_note(user_prompt: str, note: str) -> str:
    note = (note or "").strip()
    if not note:
        return user_prompt
    return (
        f"{user_prompt}\n\n"
        f"【对话备忘（极短，勿被其带偏主任务）】\n{note}"
    )


def parse_router_response(
    raw: str,
    *,
    allowed_names: set[str],
) -> dict[str, str]:
    """Parse router JSON; degrade to chat on failure."""
    text = (raw or "").strip()
    if not text:
        return {"decision": "chat", "skill_name": "", "reason": "empty_router"}

    # Extract first JSON object if model wrapped it in markdown
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {"decision": "chat", "skill_name": "", "reason": "parse_error"}

    if not isinstance(data, dict):
        return {"decision": "chat", "skill_name": "", "reason": "parse_error"}

    decision = str(data.get("decision") or "").strip().lower()
    skill_name = str(data.get("skill_name") or "").strip()
    reason = str(data.get("reason") or "").strip()

    if decision == "skill":
        if skill_name in allowed_names:
            return {
                "decision": "skill",
                "skill_name": skill_name,
                "reason": reason,
            }
        return {
            "decision": "chat",
            "skill_name": "",
            "reason": reason or "skill_not_allowed",
        }
    if decision == "clarify":
        return {"decision": "clarify", "skill_name": "", "reason": reason}
    return {"decision": "chat", "skill_name": "", "reason": reason or "chat"}
