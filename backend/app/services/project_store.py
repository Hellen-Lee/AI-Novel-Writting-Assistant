"""Project directory read/write helpers backed by local JSON/Markdown files."""

from __future__ import annotations

import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.config import PROJECTS_DIR, ensure_data_dir
from app.services.memory_store import empty_memory, save_memory

CHAPTER_ID_RE = re.compile(r"^chapter_(\d+)$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def count_words(text: str) -> int:
    """Count non-whitespace characters (works for Chinese and mixed text)."""
    return len("".join(text.split()))


def ensure_projects_dir() -> Path:
    ensure_data_dir()
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    return PROJECTS_DIR


def generate_project_id() -> str:
    return uuid.uuid4().hex[:8]


def get_project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id


def project_exists(project_id: str) -> bool:
    return (get_project_dir(project_id) / "meta.json").exists()


def _read_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default.copy()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return default.copy()
    merged = default.copy()
    merged.update(data)
    return merged


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_meta(project_id: str) -> dict[str, Any]:
    path = get_project_dir(project_id) / "meta.json"
    if not path.exists():
        raise FileNotFoundError(f"项目不存在: {project_id}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_meta(project_id: str, meta: dict[str, Any]) -> None:
    _write_json(get_project_dir(project_id) / "meta.json", meta)


def load_settings(project_id: str) -> dict[str, Any]:
    return _read_json(
        get_project_dir(project_id) / "settings.json",
        {"global_rules": "", "style_preference": ""},
    )


def save_settings(project_id: str, settings: dict[str, Any]) -> None:
    _write_json(get_project_dir(project_id) / "settings.json", settings)


def load_outline(project_id: str) -> dict[str, Any]:
    return _read_json(
        get_project_dir(project_id) / "outline.json",
        {"synopsis": "", "chapters": []},
    )


def save_outline(project_id: str, outline: dict[str, Any]) -> None:
    _write_json(get_project_dir(project_id) / "outline.json", outline)


def get_chapters_dir(project_id: str) -> Path:
    path = get_project_dir(project_id) / "chapters"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_chapter_path(project_id: str, filename: str) -> Path:
    return get_chapters_dir(project_id) / filename


def read_chapter_content(project_id: str, filename: str) -> str:
    path = get_chapter_path(project_id, filename)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def write_chapter_content(project_id: str, filename: str, content: str) -> None:
    path = get_chapter_path(project_id, filename)
    path.write_text(content, encoding="utf-8")


def _next_chapter_id(outline: dict[str, Any]) -> tuple[str, str, int]:
    chapters = outline.get("chapters") or []
    max_num = 0
    max_order = 0
    for item in chapters:
        max_order = max(max_order, int(item.get("order", 0)))
        match = CHAPTER_ID_RE.match(str(item.get("id", "")))
        if match:
            max_num = max(max_num, int(match.group(1)))
    next_num = max_num + 1
    chapter_id = f"chapter_{next_num:02d}"
    filename = f"{chapter_id}.md"
    return chapter_id, filename, max_order + 1


def recalculate_total_words(project_id: str) -> int:
    outline = load_outline(project_id)
    total = 0
    for item in outline.get("chapters") or []:
        content = read_chapter_content(project_id, item["filename"])
        total += count_words(content)
    meta = load_meta(project_id)
    meta["total_words"] = total
    meta["updated_at"] = _now_iso()
    save_meta(project_id, meta)
    return total


def list_projects() -> list[dict[str, Any]]:
    ensure_projects_dir()
    summaries: list[dict[str, Any]] = []
    for path in sorted(PROJECTS_DIR.iterdir()):
        meta_path = path / "meta.json"
        if not path.is_dir() or not meta_path.exists():
            continue
        with meta_path.open("r", encoding="utf-8") as f:
            meta = json.load(f)
        outline = load_outline(meta["id"])
        summaries.append(
            {
                "id": meta["id"],
                "name": meta.get("name", ""),
                "genre": meta.get("genre", ""),
                "description": meta.get("description", ""),
                "created_at": meta.get("created_at", ""),
                "updated_at": meta.get("updated_at", ""),
                "total_words": meta.get("total_words", 0),
                "chapter_count": len(outline.get("chapters") or []),
            }
        )
    summaries.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return summaries


def get_project_detail(project_id: str) -> dict[str, Any]:
    if not project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")
    return {
        "meta": load_meta(project_id),
        "settings": load_settings(project_id),
        "outline": load_outline(project_id),
    }


def create_project(
    *,
    name: str,
    genre: str = "",
    description: str = "",
    global_rules: str = "",
    style_preference: str = "",
    synopsis: str = "",
    first_chapter_title: str = "第一章",
) -> dict[str, Any]:
    ensure_projects_dir()
    project_id = generate_project_id()
    while project_exists(project_id):
        project_id = generate_project_id()

    now = _now_iso()
    project_dir = get_project_dir(project_id)
    chapters_dir = project_dir / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=False)

    chapter_id = "chapter_01"
    filename = "chapter_01.md"
    title = (first_chapter_title or "第一章").strip() or "第一章"

    meta = {
        "id": project_id,
        "name": name.strip(),
        "genre": genre or "",
        "description": description or "",
        "created_at": now,
        "updated_at": now,
        "total_words": 0,
    }
    settings = {
        "global_rules": global_rules or "",
        "style_preference": style_preference or "",
    }
    outline = {
        "synopsis": synopsis or "",
        "chapters": [
            {
                "id": chapter_id,
                "title": title,
                "order": 1,
                "filename": filename,
            }
        ],
    }

    save_meta(project_id, meta)
    save_settings(project_id, settings)
    save_outline(project_id, outline)
    save_memory(project_id, empty_memory(), touch_meta=False)
    write_chapter_content(project_id, filename, "")

    return get_project_detail(project_id)


def update_project(project_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    if not project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    meta = load_meta(project_id)
    settings = load_settings(project_id)
    outline = load_outline(project_id)

    for key in ("name", "genre", "description"):
        if key in updates and updates[key] is not None:
            value = updates[key]
            meta[key] = value.strip() if isinstance(value, str) and key == "name" else value

    for key in ("global_rules", "style_preference"):
        if key in updates and updates[key] is not None:
            settings[key] = updates[key]

    if "synopsis" in updates and updates["synopsis"] is not None:
        outline["synopsis"] = updates["synopsis"]

    meta["updated_at"] = _now_iso()
    save_meta(project_id, meta)
    save_settings(project_id, settings)
    save_outline(project_id, outline)
    return get_project_detail(project_id)


def delete_project(project_id: str) -> None:
    if not project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")
    shutil.rmtree(get_project_dir(project_id))


def list_chapters(project_id: str) -> list[dict[str, Any]]:
    if not project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")
    outline = load_outline(project_id)
    chapters = sorted(outline.get("chapters") or [], key=lambda c: c.get("order", 0))
    result = []
    for item in chapters:
        content = read_chapter_content(project_id, item["filename"])
        result.append(
            {
                "id": item["id"],
                "title": item.get("title", ""),
                "order": item.get("order", 0),
                "filename": item["filename"],
                "word_count": count_words(content),
            }
        )
    return result


def _find_chapter(outline: dict[str, Any], chapter_id: str) -> Optional[dict[str, Any]]:
    for item in outline.get("chapters") or []:
        if item.get("id") == chapter_id:
            return item
    return None


def get_chapter(project_id: str, chapter_id: str) -> dict[str, Any]:
    if not project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")
    outline = load_outline(project_id)
    item = _find_chapter(outline, chapter_id)
    if item is None:
        raise FileNotFoundError(f"章节不存在: {chapter_id}")
    content = read_chapter_content(project_id, item["filename"])
    return {
        "id": item["id"],
        "title": item.get("title", ""),
        "order": item.get("order", 0),
        "filename": item["filename"],
        "content": content,
        "word_count": count_words(content),
    }


def create_chapter(
    project_id: str,
    *,
    title: str = "未命名章节",
    content: str = "",
) -> dict[str, Any]:
    if not project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    outline = load_outline(project_id)
    chapter_id, filename, order = _next_chapter_id(outline)
    chapter_title = (title or "未命名章节").strip() or "未命名章节"

    outline.setdefault("chapters", []).append(
        {
            "id": chapter_id,
            "title": chapter_title,
            "order": order,
            "filename": filename,
        }
    )
    save_outline(project_id, outline)
    write_chapter_content(project_id, filename, content or "")
    recalculate_total_words(project_id)
    return get_chapter(project_id, chapter_id)


def update_chapter(
    project_id: str,
    chapter_id: str,
    *,
    title: Optional[str] = None,
    content: Optional[str] = None,
) -> dict[str, Any]:
    if not project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    outline = load_outline(project_id)
    item = _find_chapter(outline, chapter_id)
    if item is None:
        raise FileNotFoundError(f"章节不存在: {chapter_id}")

    if title is not None:
        cleaned = title.strip()
        if not cleaned:
            raise ValueError("章节标题不能为空")
        item["title"] = cleaned

    if content is not None:
        write_chapter_content(project_id, item["filename"], content)

    save_outline(project_id, outline)
    recalculate_total_words(project_id)
    return get_chapter(project_id, chapter_id)

