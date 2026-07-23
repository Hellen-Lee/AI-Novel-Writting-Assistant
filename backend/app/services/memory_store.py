"""Project memory store backed by memory.json (user-visible settings library)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.config import DATA_DIR

MEMORY_CATEGORIES = (
    "worldview",
    "characters",
    "items",
    "plot_points",
    "relationships",
)

DEFAULT_MEMORY: dict[str, list[dict[str, Any]]] = {
    category: [] for category in MEMORY_CATEGORIES
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_memory_path(project_id: str) -> Path:
    return DATA_DIR / "projects" / project_id / "memory.json"


def _project_meta_path(project_id: str) -> Path:
    return DATA_DIR / "projects" / project_id / "meta.json"


def project_exists(project_id: str) -> bool:
    return _project_meta_path(project_id).exists()


def _touch_project_updated_at(project_id: str) -> None:
    meta_path = _project_meta_path(project_id)
    if not meta_path.exists():
        return
    with meta_path.open("r", encoding="utf-8") as f:
        meta = json.load(f)
    meta["updated_at"] = _now_iso()
    with meta_path.open("w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def _normalize_entry(entry: dict[str, Any], *, now: Optional[str] = None) -> dict[str, Any]:
    stamp = now or _now_iso()
    name = str(entry.get("name", "")).strip()
    if not name:
        raise ValueError("记忆条目 name 不能为空")

    entry_id = str(entry.get("id") or "").strip() or uuid.uuid4().hex[:8]
    created_at = str(entry.get("created_at") or "").strip() or stamp
    updated_at = str(entry.get("updated_at") or "").strip() or stamp

    tags = entry.get("tags") or []
    if not isinstance(tags, list):
        raise ValueError("记忆条目 tags 必须是数组")
    normalized_tags = [str(tag).strip() for tag in tags if str(tag).strip()]

    return {
        "id": entry_id,
        "name": name,
        "content": str(entry.get("content") or ""),
        "tags": normalized_tags,
        "created_at": created_at,
        "updated_at": updated_at,
    }


def normalize_memory(memory: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Validate and normalize a full memory document."""
    if not isinstance(memory, dict):
        raise ValueError("memory 必须是对象")

    now = _now_iso()
    result: dict[str, list[dict[str, Any]]] = {}
    for category in MEMORY_CATEGORIES:
        items = memory.get(category, [])
        if items is None:
            items = []
        if not isinstance(items, list):
            raise ValueError(f"{category} 必须是数组")
        normalized_items = []
        seen_ids: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"{category} 中的条目必须是对象")
            normalized = _normalize_entry(item, now=now)
            if normalized["id"] in seen_ids:
                normalized["id"] = uuid.uuid4().hex[:8]
            seen_ids.add(normalized["id"])
            normalized_items.append(normalized)
        result[category] = normalized_items

    unknown = set(memory.keys()) - set(MEMORY_CATEGORIES)
    if unknown:
        raise ValueError(f"不支持的记忆分类: {', '.join(sorted(unknown))}")

    return result


def empty_memory() -> dict[str, list[dict[str, Any]]]:
    return {category: [] for category in MEMORY_CATEGORIES}


def load_memory(project_id: str) -> dict[str, list[dict[str, Any]]]:
    if not project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")

    path = get_memory_path(project_id)
    if not path.exists():
        memory = empty_memory()
        save_memory(project_id, memory, touch_meta=False)
        return memory

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, dict):
        return empty_memory()

    merged = empty_memory()
    for category in MEMORY_CATEGORIES:
        items = data.get(category, [])
        if isinstance(items, list):
            merged[category] = items

    try:
        return normalize_memory(merged)
    except ValueError:
        # Tolerate partially invalid legacy files by dropping bad entries.
        cleaned = empty_memory()
        for category in MEMORY_CATEGORIES:
            for item in merged.get(category, []):
                if not isinstance(item, dict):
                    continue
                try:
                    cleaned[category].append(_normalize_entry(item))
                except ValueError:
                    continue
        return cleaned


def save_memory(
    project_id: str,
    memory: dict[str, Any],
    *,
    touch_meta: bool = True,
) -> dict[str, list[dict[str, Any]]]:
    path = get_memory_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = normalize_memory(memory)
    with path.open("w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)
    if touch_meta:
        _touch_project_updated_at(project_id)
    return normalized


def replace_memory(project_id: str, memory: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    if not project_exists(project_id):
        raise FileNotFoundError(f"项目不存在: {project_id}")
    return save_memory(project_id, memory, touch_meta=True)


def add_memory_entry(
    project_id: str,
    category: str,
    entry: dict[str, Any],
) -> dict[str, Any]:
    if category not in MEMORY_CATEGORIES:
        raise ValueError(f"不支持的记忆分类: {category}")
    memory = load_memory(project_id)
    normalized = _normalize_entry(entry)
    # Ensure unique id within category
    existing_ids = {item["id"] for item in memory[category]}
    while normalized["id"] in existing_ids:
        normalized["id"] = uuid.uuid4().hex[:8]
    memory[category].append(normalized)
    save_memory(project_id, memory)
    return normalized


def update_memory_entry(
    project_id: str,
    category: str,
    entry_id: str,
    updates: dict[str, Any],
) -> dict[str, Any]:
    if category not in MEMORY_CATEGORIES:
        raise ValueError(f"不支持的记忆分类: {category}")
    memory = load_memory(project_id)
    for index, item in enumerate(memory[category]):
        if item["id"] != entry_id:
            continue
        merged = {**item, **{k: v for k, v in updates.items() if v is not None}}
        merged["id"] = entry_id
        merged["created_at"] = item.get("created_at") or _now_iso()
        merged["updated_at"] = _now_iso()
        normalized = _normalize_entry(merged)
        memory[category][index] = normalized
        save_memory(project_id, memory)
        return normalized
    raise FileNotFoundError(f"记忆条目不存在: {category}/{entry_id}")


def delete_memory_entry(project_id: str, category: str, entry_id: str) -> None:
    if category not in MEMORY_CATEGORIES:
        raise ValueError(f"不支持的记忆分类: {category}")
    memory = load_memory(project_id)
    before = len(memory[category])
    memory[category] = [item for item in memory[category] if item["id"] != entry_id]
    if len(memory[category]) == before:
        raise FileNotFoundError(f"记忆条目不存在: {category}/{entry_id}")
    save_memory(project_id, memory)
