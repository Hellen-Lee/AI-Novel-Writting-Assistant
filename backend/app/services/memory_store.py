"""Project memory store backed by memory.json."""

import json
from pathlib import Path
from typing import Any

from app.config import DATA_DIR

DEFAULT_MEMORY = {
    "worldview": [],
    "characters": [],
    "items": [],
    "plot_points": [],
    "relationships": [],
}


def get_memory_path(project_id: str) -> Path:
    return DATA_DIR / "projects" / project_id / "memory.json"


def load_memory(project_id: str) -> dict[str, Any]:
    path = get_memory_path(project_id)
    if not path.exists():
        return DEFAULT_MEMORY.copy()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    merged = DEFAULT_MEMORY.copy()
    merged.update(data)
    return merged


def save_memory(project_id: str, memory: dict[str, Any]) -> None:
    path = get_memory_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(memory, f, ensure_ascii=False, indent=2)
