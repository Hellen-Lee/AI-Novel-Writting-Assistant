"""Load SKILL.md files with YAML frontmatter."""

import re
from pathlib import Path
from typing import Any

SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"

_skills: dict[str, dict[str, Any]] = {}


def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not match:
        return {}, text
    meta_text, body = match.groups()
    # Minimal YAML-like parsing for MVP: only key: value lines
    meta: dict[str, Any] = {}
    for line in meta_text.splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip()
    return meta, body.strip()


def _load_skill_file(path: Path) -> dict[str, Any] | None:
    text = path.read_text(encoding="utf-8")
    meta, body = _parse_frontmatter(text)
    name = meta.get("name", path.stem)
    return {
        "name": name,
        "description": meta.get("description", ""),
        "system": meta.get("system", ""),
        "user_template": body,
    }


def load_skills() -> None:
    global _skills
    _skills = {}
    for directory in (SKILLS_DIR, SKILLS_DIR / "custom"):
        if not directory.exists():
            continue
        for path in directory.glob("*.md"):
            skill = _load_skill_file(path)
            if skill:
                _skills[skill["name"]] = skill


def get_skill(name: str) -> dict[str, Any] | None:
    if not _skills:
        load_skills()
    return _skills.get(name)


def list_skills() -> list[dict[str, Any]]:
    if not _skills:
        load_skills()
    return [{"name": s["name"], "description": s["description"]} for s in _skills.values()]
