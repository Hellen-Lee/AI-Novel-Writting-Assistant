"""Read-only agent tools: the model self-decides which project context to fetch.

These tools let the model pull chapters / outline / memory on demand instead of
having them pre-stuffed into the prompt. All tools are read-only; writing to the
draft/editor is handled by the frontend aiDraft card, so nothing here mutates
project data.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from app.services import memory_store, project_store

# Per-tool result char caps (protect the context window from huge tool results).
READ_CHAPTER_MAX_CHARS = 6000
READ_RECENT_MAX_CHARS = 8000
OUTLINE_MAX_CHARS = 6000
MEMORY_MAX_CHARS = 6000

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "read_chapter",
            "description": "读取项目指定章节的正文（含标题与字数）。用于续写/润色/扩写前获取目标章节或对比前文。",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "string",
                        "description": "章节 ID，如 chapter_02",
                    },
                    "offset": {
                        "type": "integer",
                        "description": "从第几个字符开始读取（默认 0）",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "最多返回多少字符（默认 4000）",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_recent_work",
            "description": "读取项目最近 n 章（按章节顺序）的正文，用于续写前获取前文上下文。",
            "parameters": {
                "type": "object",
                "properties": {
                    "n": {
                        "type": "integer",
                        "description": "最近几章（默认 3，最大 5）",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_outline",
            "description": "读取全书概要（synopsis）、分卷大纲（volumes）与章节列表。用于把握剧情走向与当前进度。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_memory",
            "description": "在项目记忆（世界观/人物/故事内核）中按关键词检索条目。用于确认设定、人物关系、避免设定冲突。",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["worldview", "characters", "story_core"],
                        "description": "限定分类；省略则检索全部",
                    },
                    "keyword": {
                        "type": "string",
                        "description": "检索关键词（人名/地名/概念）",
                    },
                },
                "required": ["keyword"],
            },
        },
    },
]


def _cap(text: str, max_chars: int) -> tuple[str, bool]:
    text = text or ""
    if max_chars <= 0 or len(text) <= max_chars:
        return text, False
    return text[: max_chars - 12] + "…（工具结果截断）", True


def _read_chapter(project_id: str, args: dict[str, Any]) -> tuple[str, bool]:
    chapter_id = str(args.get("chapter_id") or "").strip()
    if not chapter_id:
        return "参数错误：缺少 chapter_id。", True
    try:
        chapter = project_store.get_chapter(project_id, chapter_id)
    except FileNotFoundError as exc:
        return f"读取失败：{exc}", True

    content = str(chapter.get("content") or "")
    offset = int(args.get("offset") or 0)
    if offset < 0:
        offset = 0
    limit = int(args.get("limit") or 4000)
    if limit <= 0:
        limit = 4000
    content = content[offset : offset + limit]

    header = (
        f"【章节】{chapter.get('title') or chapter_id}"
        f"（ID={chapter_id}，字数约 {chapter.get('word_count') or 0}）"
    )
    body = content.strip() or "（本章为空）"
    return _cap(f"{header}\n\n{body}", READ_CHAPTER_MAX_CHARS)


def _read_recent_work(project_id: str, args: dict[str, Any]) -> tuple[str, bool]:
    chapters = project_store.list_chapters(project_id)
    if not chapters:
        return "（暂无章节）", False

    try:
        n = max(1, min(int(args.get("n") or 3), 5))
    except (TypeError, ValueError):
        n = 3
    selected = chapters[-n:]

    blocks: list[str] = []
    for chapter in selected:
        content = project_store.read_chapter_content(
            project_id, chapter["filename"]
        )
        title = str(chapter.get("title") or chapter["id"])
        blocks.append(f"### {title}\n{content.strip() or '（空）'}")
    return _cap("\n\n".join(blocks), READ_RECENT_MAX_CHARS)


def _get_outline(project_id: str, args: dict[str, Any]) -> tuple[str, bool]:
    outline = project_store.load_outline(project_id)
    lines: list[str] = []

    synopsis = str(outline.get("synopsis") or "").strip()
    lines.append("【全书概要】")
    lines.append(synopsis or "（无）")

    volumes = outline.get("volumes") or []
    if volumes:
        lines.append("")
        lines.append("【分卷】")
        for vol in volumes:
            if not isinstance(vol, dict):
                continue
            label = str(vol.get("label") or "").strip()
            name = str(vol.get("name") or "").strip()
            summary = str(vol.get("summary") or "").strip()
            title = " · ".join(p for p in (label, name) if p) or "未命名分卷"
            lines.append(f"- {title}：{summary or '（无摘要）'}")

    chapters = outline.get("chapters") or []
    if chapters:
        lines.append("")
        lines.append("【章节列表】")
        for ch in chapters:
            if not isinstance(ch, dict):
                continue
            order = ch.get("order")
            title = str(ch.get("title") or ch.get("id") or "?")
            lines.append(f"- {order}. {title}（{ch.get('id') or '?'}）")

    return _cap("\n".join(lines), OUTLINE_MAX_CHARS)


def _search_memory(project_id: str, args: dict[str, Any]) -> tuple[str, bool]:
    keyword = str(args.get("keyword") or "").strip()
    if not keyword:
        return "参数错误：缺少 keyword。", True
    kw = keyword.lower()
    category = str(args.get("category") or "").strip() or None

    memory = memory_store.load_memory(project_id)
    categories: list[str] = []
    if category:
        if category in memory:
            categories = [category]
    else:
        categories = list(memory.keys())

    lines: list[str] = []
    matched_any = False
    for cat in categories:
        for entry in memory.get(cat) or []:
            if not isinstance(entry, dict):
                continue
            haystack = " ".join(
                str(v) for v in [
                    entry.get("name"),
                    entry.get("content"),
                    entry.get("profile"),
                    entry.get("relationship"),
                    entry.get("tags"),
                ] if v is not None
            ).lower()
            if kw not in haystack:
                continue
            matched_any = True
            name = str(entry.get("name") or "").strip() or "未命名"
            tag_text = ""
            tags = entry.get("tags")
            if isinstance(tags, list) and tags:
                tag_text = " [" + ", ".join(str(t) for t in tags) + "]"
            detail = str(entry.get("content") or entry.get("profile") or "").strip()
            lines.append(f"[{cat}] {name}{tag_text}：{detail or '（无详情）'}")

    if not matched_any:
        return f"（记忆中没有匹配「{keyword}」的条目）", False
    return _cap("\n".join(lines), MEMORY_MAX_CHARS)


TOOL_FUNCTIONS: dict[str, Any] = {
    "read_chapter": _read_chapter,
    "read_recent_work": _read_recent_work,
    "get_outline": _get_outline,
    "search_memory": _search_memory,
}


def tool_names() -> list[str]:
    return list(TOOL_FUNCTIONS.keys())


def execute_tool(
    project_id: str,
    name: str,
    arguments: Optional[dict[str, Any]],
    *,
    tool_call_id: str = "",
) -> dict[str, Any]:
    """Execute a tool and return a result block for the conversation.

    Returns {"tool_call_id", "name", "content" (capped str), "truncated": bool}.
    `tool_call_id` must be the upstream model's real call id for a later tool
    message to satisfy the assistant message's tool_calls. Unknown tool /
    handler error surfaces as a message (does not raise).
    """
    args = arguments if isinstance(arguments, dict) else {}
    handler = TOOL_FUNCTIONS.get(name)
    if handler is None:
        content = f"未知工具：{name}"
        return {
            "tool_call_id": tool_call_id,
            "name": name,
            "content": content,
            "truncated": False,
        }
    try:
        content, truncated = handler(project_id, args)
    except FileNotFoundError as exc:
        content, truncated = f"读取失败：{exc}", True
    except Exception as exc:  # noqa: BLE001 - tool results must never crash the loop
        content, truncated = f"工具执行出错：{exc}", True

    return {
        "tool_call_id": tool_call_id,
        "name": name,
        "content": content,
        "truncated": truncated,
    }


def serialize_arguments(name: str, arguments: dict[str, Any]) -> str:
    """Render a tool call's arguments for run-ledger display."""
    try:
        return json.dumps(arguments or {}, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(arguments or "")
