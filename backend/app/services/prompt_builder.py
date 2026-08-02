"""Assemble prompts from SKILL.md templates and project context."""

from __future__ import annotations

from string import Template
from typing import Any, Optional

from app.services import memory_store, project_store, skill_loader
from app.services.skill_loader import KIND_QUICK_ACTION, KIND_SKILL


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
    items = "（无）"
    plot_points = "（无）"
    previous_chapters = "（无）"

    if project_id and project_store.project_exists(project_id):
        settings = project_store.load_settings(project_id)
        global_rules = str(settings.get("global_rules") or "")
        style_preference = str(settings.get("style_preference") or "")

        memory = memory_store.load_memory(project_id)
        worldview = _format_memory_entries(memory.get("worldview") or [])
        characters = _format_characters(memory.get("characters") or [])
        items = _format_memory_entries(memory.get("items") or [])
        plot_points = _format_memory_entries(memory.get("plot_points") or [])
        previous_chapters = _format_previous_chapters(
            project_id, chapter_id=chapter_id, limit=3
        )

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
        "items": items,
        "plot_points": plot_points,
        # Deprecated: kept so old templates with $relationships do not leave the placeholder.
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
