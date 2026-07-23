"""Load and validate SKILL.md files (quick_action | skill)."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Optional

import yaml

logger = logging.getLogger(__name__)

SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"
KIND_QUICK_ACTION = "quick_action"
KIND_SKILL = "skill"
VALID_KINDS = frozenset({KIND_QUICK_ACTION, KIND_SKILL})

# 允许 continue、generate_setting、scene-beat
NAME_RE = re.compile(r"^[a-z0-9]+(?:[_-][a-z0-9]+)*$")

_skills: dict[str, dict[str, Any]] = {}
_load_errors: list[str] = []


class SkillValidationError(ValueError):
    """Raised when a SKILL.md file fails validation."""


def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---"):
        return {}, text.strip()

    rest = text[3:]
    if rest.startswith("\r\n"):
        rest = rest[2:]
    elif rest.startswith("\n"):
        rest = rest[1:]

    closer = re.search(r"\n---\s*\n", rest)
    if not closer:
        # Allow ending with --- and no trailing body newline
        closer = re.search(r"\n---\s*$", rest)
        if not closer:
            raise SkillValidationError("缺少结束的 frontmatter 分隔符 ---")
        meta_text = rest[: closer.start()]
        body = ""
    else:
        meta_text = rest[: closer.start()]
        body = rest[closer.end() :]

    try:
        meta = yaml.safe_load(meta_text) or {}
    except yaml.YAMLError as exc:
        raise SkillValidationError(f"YAML frontmatter 解析失败: {exc}") from exc

    if not isinstance(meta, dict):
        raise SkillValidationError("frontmatter 必须是键值映射")

    return meta, body.strip()


def _as_bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1"}:
            return True
        if lowered in {"false", "no", "0"}:
            return False
    raise SkillValidationError(
        f"disable-model-invocation 必须是布尔值，收到: {value!r}"
    )


def _validate_and_normalize(
    meta: dict[str, Any],
    body: str,
    *,
    path: Path,
    source: str,
) -> dict[str, Any]:
    name = str(meta.get("name") or path.stem).strip()
    if not name or not NAME_RE.match(name):
        raise SkillValidationError(
            f"name 无效（需小写字母/数字/下划线或连字符）: {name!r}"
        )

    description = str(meta.get("description") or "").strip()
    if not description:
        raise SkillValidationError("description 不能为空")

    kind = str(meta.get("kind") or "").strip()
    if kind not in VALID_KINDS:
        raise SkillValidationError(
            f"kind 必须是 {sorted(VALID_KINDS)} 之一，收到: {kind!r}"
        )

    if not body:
        raise SkillValidationError("正文内容不能为空")

    disable_model_invocation = _as_bool(
        meta.get("disable-model-invocation"), default=True
    )

    system_raw = meta.get("system")
    system = ""
    if system_raw is not None:
        system = str(system_raw).strip()

    if kind == KIND_QUICK_ACTION:
        if not system:
            raise SkillValidationError(
                "kind=quick_action 时 system 字段必填且不能为空"
            )
    else:
        if system:
            raise SkillValidationError(
                "kind=skill 时禁止提供 system 字段（调用时 system 固定为空）"
            )
        system = ""

    return {
        "name": name,
        "description": description,
        "kind": kind,
        "system": system,
        "user_template": body,
        "disable_model_invocation": disable_model_invocation,
        "source": source,
        "path": str(path),
    }


def _load_skill_file(path: Path, *, source: str) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    meta, body = _parse_frontmatter(text)
    return _validate_and_normalize(meta, body, path=path, source=source)


def load_skills() -> dict[str, dict[str, Any]]:
    """Scan builtin + custom skill dirs. Custom overrides same name."""
    global _skills, _load_errors
    _skills = {}
    _load_errors = []

    scan_roots = [
        (SKILLS_DIR, "builtin"),
        (SKILLS_DIR / "custom", "custom"),
    ]

    for directory, source in scan_roots:
        if not directory.exists():
            if source == "custom":
                directory.mkdir(parents=True, exist_ok=True)
            continue

        for path in sorted(directory.glob("*.md")):
            # Do not treat nested dirs; only direct *.md in each root
            if path.parent != directory:
                continue
            try:
                skill = _load_skill_file(path, source=source)
            except (OSError, SkillValidationError) as exc:
                msg = f"{path}: {exc}"
                _load_errors.append(msg)
                logger.warning("跳过无效 SKILL: %s", msg)
                continue

            name = skill["name"]
            if name in _skills and source == "custom":
                logger.info("自定义技能覆盖内置: %s", name)
            _skills[name] = skill

    return _skills


def get_load_errors() -> list[str]:
    return list(_load_errors)


def get_skill(name: str) -> Optional[dict[str, Any]]:
    if not _skills:
        load_skills()
    return _skills.get(name)


def list_skills(
    *,
    kind: Optional[str] = None,
    include_auto_invocable_only: bool = False,
) -> list[dict[str, Any]]:
    if not _skills:
        load_skills()

    items: list[dict[str, Any]] = []
    for skill in _skills.values():
        if kind and skill["kind"] != kind:
            continue
        if include_auto_invocable_only and skill["disable_model_invocation"]:
            continue
        items.append(
            {
                "name": skill["name"],
                "description": skill["description"],
                "kind": skill["kind"],
                "disable_model_invocation": skill["disable_model_invocation"],
                "source": skill["source"],
                "slash_command": f"/{skill['name']}",
            }
        )

    items.sort(key=lambda s: (0 if s["kind"] == KIND_QUICK_ACTION else 1, s["name"]))
    return items


def get_skill_detail(name: str) -> Optional[dict[str, Any]]:
    skill = get_skill(name)
    if skill is None:
        return None
    return {
        "name": skill["name"],
        "description": skill["description"],
        "kind": skill["kind"],
        "system": skill["system"],
        "user_template": skill["user_template"],
        "disable_model_invocation": skill["disable_model_invocation"],
        "source": skill["source"],
        "slash_command": f"/{skill['name']}",
        "path": skill["path"],
    }
