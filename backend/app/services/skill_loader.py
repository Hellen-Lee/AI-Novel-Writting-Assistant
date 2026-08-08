"""Load and validate SKILL.md files (quick_action | skill)."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Optional

import yaml

from app.config import CUSTOM_SKILLS_DIR, ensure_data_dir

logger = logging.getLogger(__name__)

# 内置技能（随仓库分发）；自定义技能在 data/skills/（本地数据，不入库）
BUILTIN_SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"
KIND_QUICK_ACTION = "quick_action"
KIND_SKILL = "skill"
VALID_KINDS = frozenset({KIND_QUICK_ACTION, KIND_SKILL})

# 允许中文、小写字母/数字；可用 _ 或 - 连接（如 continue、scene-beat、场景节拍）
NAME_RE = re.compile(
    r"^[\u4e00-\u9fffa-z0-9]+(?:[_-][\u4e00-\u9fffa-z0-9]+)*$"
)

_skills: dict[str, dict[str, Any]] = {}
_builtin_names: set[str] = set()
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
            f"name 无效（需中文、小写字母/数字，可用下划线或连字符）: {name!r}"
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
    """Scan builtin + custom skill dirs. Custom may not reuse builtin names."""
    global _skills, _builtin_names, _load_errors
    _skills = {}
    _builtin_names = set()
    _load_errors = []

    ensure_data_dir()
    scan_roots = [
        (BUILTIN_SKILLS_DIR, "builtin"),
        (CUSTOM_SKILLS_DIR, "custom"),
    ]

    for directory, source in scan_roots:
        if not directory.exists():
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
            if source == "builtin":
                _builtin_names.add(name)
            elif name in _builtin_names:
                msg = f"{path}: 自定义技能不能使用内置 name {name!r}，已跳过"
                _load_errors.append(msg)
                logger.warning("%s", msg)
                continue
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


def _custom_dir() -> Path:
    ensure_data_dir()
    return CUSTOM_SKILLS_DIR


def _custom_path(name: str) -> Path:
    return _custom_dir() / f"{name}.md"


def _yaml_scalar(value: str) -> str:
    """Dump a single YAML scalar (quoted when needed)."""
    # Wrap in a mapping so PyYAML won't append a bare document-end `...`
    dumped = yaml.safe_dump(
        {"v": value},
        allow_unicode=True,
        default_flow_style=False,
        width=1000,
        sort_keys=False,
    )
    # "v: <scalar>\n" or "v: |-\n  ...\n"
    _, _, rest = dumped.partition(":")
    return rest.lstrip(" ").rstrip("\n")


def serialize_skill_markdown(
    *,
    name: str,
    description: str,
    kind: str,
    disable_model_invocation: bool,
    system: str,
    user_template: str,
) -> str:
    """Serialize skill fields to SKILL.md text (YAML frontmatter + body)."""
    lines = [
        "---",
        f"name: {name}",
        f"description: {_yaml_scalar(description)}",
        f"kind: {kind}",
        f"disable-model-invocation: {'true' if disable_model_invocation else 'false'}",
    ]
    if kind == KIND_QUICK_ACTION:
        lines.append("system: |")
        sys_text = (system or "").rstrip("\n")
        if not sys_text:
            lines.append("  ")
        else:
            for sys_line in sys_text.splitlines():
                lines.append(f"  {sys_line}")
    lines.append("---")
    body = user_template.strip()
    lines.append(body)
    lines.append("")
    return "\n".join(lines)


def upsert_custom_skill(
    *,
    path_name: str,
    name: str,
    description: str,
    kind: str,
    disable_model_invocation: bool = True,
    system: str = "",
    user_template: str = "",
) -> dict[str, Any]:
    """
    Create or update a skill under data/skills/.
    Builtin skills are read-only and cannot be overridden by name.
    If path_name differs from name and path_name is a custom skill, rename (delete old file).
    """
    if not _skills:
        load_skills()

    existing_path = get_skill(path_name)
    if existing_path is not None and existing_path["source"] == "builtin":
        raise PermissionError("内置技能不可编辑")

    if name in _builtin_names:
        raise SkillValidationError(
            f"不能使用内置技能的 name: {name!r}，请换一个名称"
        )

    target_path = _custom_path(name)
    # Validate before touching disk
    draft = _validate_and_normalize(
        {
            "name": name,
            "description": description,
            "kind": kind,
            "disable-model-invocation": disable_model_invocation,
            "system": system if kind == KIND_QUICK_ACTION else None,
        },
        user_template,
        path=target_path,
        source="custom",
    )

    text = serialize_skill_markdown(
        name=draft["name"],
        description=draft["description"],
        kind=draft["kind"],
        disable_model_invocation=draft["disable_model_invocation"],
        system=draft["system"],
        user_template=draft["user_template"],
    )

    if path_name != name:
        existing = get_skill(path_name)
        if existing is None:
            raise SkillValidationError(f"原技能不存在，无法重命名: {path_name}")
        if existing["source"] != "custom":
            raise SkillValidationError("只能重命名自定义技能")
        old_path = Path(existing["path"])
        if old_path.resolve() != target_path.resolve() and old_path.exists():
            old_path.unlink()

    target_path.write_text(text, encoding="utf-8")
    load_skills()
    detail = get_skill_detail(name)
    if detail is None:
        raise SkillValidationError(f"保存后未能加载技能: {name}")
    return detail


def delete_custom_skill(name: str) -> dict[str, Any]:
    """Delete a custom skill file. Builtin-only skills cannot be deleted."""
    skill = get_skill(name)
    if skill is None:
        raise FileNotFoundError(f"Skill not found: {name}")
    if skill["source"] != "custom":
        raise PermissionError("只能删除自定义技能，内置技能不可删除")

    path = Path(skill["path"])
    if path.exists():
        path.unlink()

    load_skills()
    # If a builtin with the same name remains, return its detail; else gone
    restored = get_skill_detail(name)
    return {
        "deleted": name,
        "restored_builtin": restored is not None and restored["source"] == "builtin",
        "skill": restored,
    }
