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
    "story_core",
)

# Deprecated top-level keys; stripped on load, rejected on strict normalize/save.
_LEGACY_CATEGORIES = frozenset({"relationships", "items", "plot_points"})

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


def _normalize_tags(tags: Any) -> list[str]:
    if tags is None:
        tags = []
    if not isinstance(tags, list):
        raise ValueError("记忆条目 tags 必须是数组")
    return [str(tag).strip() for tag in tags if str(tag).strip()]


def _normalize_relationship_list(raw: Any) -> list[dict[str, str]]:
    """Normalize to [{type, target}, ...]; accept legacy object map."""
    if raw is None:
        return []

    pairs: list[tuple[str, str]] = []
    if isinstance(raw, dict):
        for key, value in raw.items():
            rel_type = str(key).strip()
            target = str(value).strip() if value is not None else ""
            if rel_type and target:
                pairs.append((rel_type, target))
    elif isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            rel_type = str(item.get("type") or "").strip()
            target = str(item.get("target") or "").strip()
            if rel_type and target:
                pairs.append((rel_type, target))
    else:
        raise ValueError("relationship 必须是数组或对象")

    return [{"type": t, "target": n} for t, n in pairs]


def _normalize_generic_entry(
    entry: dict[str, Any], *, now: Optional[str] = None
) -> dict[str, Any]:
    stamp = now or _now_iso()
    name = str(entry.get("name", "")).strip()
    if not name:
        raise ValueError("记忆条目 name 不能为空")

    entry_id = str(entry.get("id") or "").strip() or uuid.uuid4().hex[:8]
    created_at = str(entry.get("created_at") or "").strip() or stamp
    updated_at = str(entry.get("updated_at") or "").strip() or stamp

    return {
        "id": entry_id,
        "name": name,
        "content": str(entry.get("content") or ""),
        "tags": _normalize_tags(entry.get("tags")),
        "created_at": created_at,
        "updated_at": updated_at,
    }


def _normalize_character_entry(
    entry: dict[str, Any], *, now: Optional[str] = None
) -> dict[str, Any]:
    stamp = now or _now_iso()
    name = str(entry.get("name", "")).strip()
    if not name:
        raise ValueError("记忆条目 name 不能为空")

    entry_id = str(entry.get("id") or "").strip() or uuid.uuid4().hex[:8]
    created_at = str(entry.get("created_at") or "").strip() or stamp
    updated_at = str(entry.get("updated_at") or "").strip() or stamp

    # Legacy MemoryEntry used `content` for character bio.
    if "profile" in entry:
        profile = str(entry.get("profile") or "")
    elif "content" in entry:
        profile = str(entry.get("content") or "")
    else:
        profile = ""

    return {
        "id": entry_id,
        "name": name,
        "profile": profile,
        "relationship": _normalize_relationship_list(entry.get("relationship")),
        "tags": _normalize_tags(entry.get("tags")),
        "created_at": created_at,
        "updated_at": updated_at,
    }


def _normalize_entry(
    entry: dict[str, Any],
    category: str,
    *,
    now: Optional[str] = None,
) -> dict[str, Any]:
    if category == "characters":
        return _normalize_character_entry(entry, now=now)
    return _normalize_generic_entry(entry, now=now)


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
            normalized = _normalize_entry(item, category, now=now)
            if normalized["id"] in seen_ids:
                normalized["id"] = uuid.uuid4().hex[:8]
            seen_ids.add(normalized["id"])
            normalized_items.append(normalized)
        result[category] = normalized_items

    unknown = set(memory.keys()) - set(MEMORY_CATEGORIES) - _LEGACY_CATEGORIES
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
        normalized = normalize_memory(merged)
    except ValueError:
        # Tolerate partially invalid legacy files by dropping bad entries.
        cleaned = empty_memory()
        for category in MEMORY_CATEGORIES:
            for item in merged.get(category, []):
                if not isinstance(item, dict):
                    continue
                try:
                    cleaned[category].append(_normalize_entry(item, category))
                except ValueError:
                    continue
        normalized = cleaned

    # Persist migration when dropping legacy keys, adding story_core, or reshaping characters.
    needs_rewrite = bool(_LEGACY_CATEGORIES.intersection(data.keys()))
    if "story_core" not in data:
        needs_rewrite = True
    if not needs_rewrite:
        for item in data.get("characters") or []:
            if not isinstance(item, dict):
                continue
            if "content" in item or isinstance(item.get("relationship"), dict):
                needs_rewrite = True
                break
    if needs_rewrite:
        save_memory(project_id, normalized, touch_meta=False)

    return normalized


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
    normalized = _normalize_entry(entry, category)
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
        if category == "characters":
            if (
                "profile" not in updates
                and updates.get("content") is not None
            ):
                merged["profile"] = updates["content"]
            merged.pop("content", None)
        normalized = _normalize_entry(merged, category)
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
