"""引导页 AI 一键生成设定（无状态，项目创建前）。

与编辑页生成链路（generation_service + SKILL.md）职责分离：
- 本模块：引导页世界观/内核/角色/大纲的批量或单区生成，返回结构化 JSON 回填待确认。
- 编辑页：续写/润色/扩写/生成设定仍走 SKILL.md + 会话链路。

本项目不建 project / 不入 Agent 会话与 run 账本；复用 model_client 与统一模型配置。
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from app.models.schemas import OnboardingSection
from app.services.model_client import ModelClientError, build_client

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "你是资深小说设定设计师，负责为新作品设计完整的世界观、故事内核、主要角色与全本大纲。"
    "只输出一个合法的 JSON 对象，不要输出任何解释、markdown 代码块标记或其他文字。"
    "JSON 必须严格使用中文字符串，不要使用英文键名。"
)

# 四区块的 JSON 字段骨架；宽容解析时按此兜底。
FULL_SKELETON: dict[str, Any] = {
    "worldview": "",
    "story_core": {"theme": "", "conflict": "", "plotline": ""},
    "characters": [],
    "synopsis": "",
    "volumes": [],
}

SECTION_SKELETONS: dict[str, dict[str, Any]] = {
    "worldview": {"worldview": ""},
    "story_core": {"story_core": {"theme": "", "conflict": "", "plotline": ""}},
    "characters": {"characters": []},
    "outline": {"synopsis": "", "volumes": []},
}


def _fmt_characters(characters: list[dict[str, Any]]) -> str:
    """把前端角色草稿渲染为可读文本，供上下文展示。"""
    if not characters:
        return "（无）"
    lines = []
    for i, c in enumerate(characters, 1):
        name = str(c.get("name") or "未命名角色")
        role = str(c.get("role") or "").strip()
        profile = str(c.get("profile") or "").strip()
        rels = c.get("relationship") or []
        rel_text = "、".join(
            f"{r.get('type') or ''}·{r.get('target') or ''}"
            for r in rels
            if isinstance(r, dict) and r.get("type") and r.get("target")
        )
        parts = [name]
        if role:
            parts.append(f"（定位：{role}）")
        if profile:
            parts.append(f"简介：{profile}")
        if rel_text:
            parts.append(f"关系：{rel_text}")
        lines.append(f"{i}. " + " ".join(parts))
    return "\n".join(lines)


def _fmt_volumes(volumes: list[dict[str, Any]]) -> str:
    if not volumes:
        return "（无）"
    lines = []
    for i, v in enumerate(volumes, 1):
        name = str(v.get("name") or "")
        summary = str(v.get("summary") or "")
        lines.append(f"{i}. {name}：{summary}")
    return "\n".join(lines)


def _fmt_story_core(story_core: dict[str, Any]) -> str:
    theme = str(story_core.get("theme") or "")
    conflict = str(story_core.get("conflict") or "")
    plotline = str(story_core.get("plotline") or "")
    lines = []
    if theme:
        lines.append(f"核心主题：{theme}")
    if conflict:
        lines.append(f"核心冲突：{conflict}")
    if plotline:
        lines.append(f"故事主线：{plotline}")
    return "\n".join(lines) if lines else "（无）"


def _build_user_prompt(
    *,
    topic: str,
    genre: str,
    worldview: str,
    story_core: dict[str, Any],
    characters: list[dict[str, Any]],
    synopsis: str,
    volumes: list[dict[str, Any]],
    section: Optional[str],
) -> str:
    """根据当前已填内容与目标区块组装 user prompt（硬编码模板）。"""
    parts = ["请为一个新小说作品设计设定。"]

    parts.append("\n【用户提供的核心想法/题材】")
    parts.append(topic.strip() or "（未提供，请自行构思一个鲜明有趣的主题）")

    if genre.strip():
        parts.append(f"\n【题材】{genre.strip()}")

    parts.append("\n【当前已填内容，作为参考上下文】")
    parts.append(f"- 世界观：{worldview.strip() or '（无）'}")
    parts.append(f"- 故事内核：{_fmt_story_core(story_core)}")
    parts.append(f"- 主要角色：\n{_fmt_characters(characters)}")
    parts.append(f"- 全书概要：{synopsis.strip() or '（无）'}")
    parts.append(f"- 分卷大纲：\n{_fmt_volumes(volumes)}")

    if section:
        labels = {
            "worldview": "世界观",
            "story_core": "故事内核",
            "characters": "主要角色",
            "outline": "全本大纲",
        }
        parts.append(
            f"\n【本次任务】只生成并返回「{labels[section]}」区块，其他字段保持空值或省略。"
            "若该区块当前已有内容，请在其基础上重新生成更完善、与其余已填内容协调的版本。"
        )
    else:
        parts.append(
            "\n【本次任务】一次性生成完整设定：世界观、故事内核（theme/conflict/plotline 三行）、"
            "主要角色（建议 3-6 个，每个含 name/role/profile/relationship）、全书概要 synopsis、"
            "分卷大纲 volumes（建议 3-6 卷，每卷含 name/summary）。各部分要与用户想法协调一致。"
        )

    parts.append(
        "\n【输出 JSON 字段约定】\n"
        "- worldview: 字符串，世界背景/时代/力量体系/地理等。\n"
        "- story_core: 对象，含 theme/conflict/plotline 三个字符串字段。\n"
        "- characters: 数组，元素为 {name, role, profile, relationship}，"
        "relationship 为 {type, target} 数组（type 可用中文，如 师徒/宿敌/恋人）。\n"
        "- synopsis: 字符串，全书概要。\n"
        "- volumes: 数组，元素为 {name, summary}。\n"
        "仅输出以上 JSON 对象本身。"
    )

    return "\n".join(parts)


def _strip_code_fence(raw: str) -> str:
    """移除 ```json ... ``` 代码块包裹。"""
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fence:
        return fence.group(1).strip()
    # 若整体被反引号包裹但无换行，退化为剥首尾反引号
    if text.startswith("`") and text.endswith("`") and text.count("`") == 2:
        return text[1:-1].strip()
    return text


def _as_str(value: Any) -> str:
    return str(value or "").strip()


def _as_list(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [v for v in value if isinstance(v, dict)]
    return []


def _as_str_dict(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {"theme": "", "conflict": "", "plotline": ""}
    return {
        "theme": _as_str(value.get("theme")),
        "conflict": _as_str(value.get("conflict")),
        "plotline": _as_str(value.get("plotline")),
    }


def _parse_response(raw: str) -> dict[str, Any]:
    """宽容解析模型输出：剥代码块 → json.loads → 字段兜底。失败抛 ValueError。"""
    text = _strip_code_fence(raw)
    # 尝试整体解析；失败则尝试提取首个 { ... } 平衡片段
    obj: Optional[dict[str, Any]] = None
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                obj = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                obj = None
    if not isinstance(obj, dict):
        raise ValueError("模型输出无法解析为 JSON 对象")
    return obj


def _merge_section_result(section: str, obj: dict[str, Any]) -> dict[str, Any]:
    """从全量解析结果中取出目标区块，保持兼容全量/单区两种返回形态。"""
    skeleton = SECTION_SKELETONS[section]
    out = dict(skeleton)

    if section == "worldview":
        out["worldview"] = _as_str(obj.get("worldview"))
    elif section == "story_core":
        out["story_core"] = _as_str_dict(obj.get("story_core"))
    elif section == "characters":
        out["characters"] = _as_list(obj.get("characters"))
    elif section == "outline":
        out["synopsis"] = _as_str(obj.get("synopsis"))
        out["volumes"] = _as_list(obj.get("volumes"))
    return out


def _normalize_characters(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for item in items:
        name = _as_str(item.get("name"))
        if not name:
            continue
        relationship = [
            {"type": _as_str(r.get("type")), "target": _as_str(r.get("target"))}
            for r in _as_list(item.get("relationship"))
            if _as_str(r.get("type")) and _as_str(r.get("target"))
        ]
        normalized.append(
            {
                "name": name,
                "role": _as_str(item.get("role")),
                "profile": _as_str(item.get("profile")),
                "relationship": relationship,
            }
        )
    return normalized


def _normalize_volumes(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for item in items:
        name = _as_str(item.get("name"))
        if not name:
            continue
        normalized.append({"name": name, "summary": _as_str(item.get("summary"))})
    return normalized


def _extract_section(
    section: Optional[str], obj: dict[str, Any]
) -> dict[str, Any]:
    """从解析出的 JSON 中取所需区块结果（全量四区块 or 单区）。"""
    if section is None:
        return {
            "worldview": _as_str(obj.get("worldview")),
            "story_core": _as_str_dict(obj.get("story_core")),
            "characters": _normalize_characters(_as_list(obj.get("characters"))),
            "synopsis": _as_str(obj.get("synopsis")),
            "volumes": _normalize_volumes(_as_list(obj.get("volumes"))),
        }
    return _merge_section_result(section, obj)


def generate_onboarding_settings(
    *,
    topic: str = "",
    genre: str = "",
    worldview: str = "",
    story_core: Optional[dict[str, Any]] = None,
    characters: Optional[list[dict[str, Any]]] = None,
    synopsis: str = "",
    volumes: Optional[list[dict[str, Any]]] = None,
    section: Optional[OnboardingSection] = None,
    model: Optional[str] = None,
) -> dict[str, Any]:
    """生成引导页设定，返回对齐四区块的 dict。

    section 为空 → 全量生成；否则仅重生成该区块（其余字段置空）。
    非流式、无状态；解析失败抛 ValueError。
    """
    section_name = section.value if isinstance(section, OnboardingSection) else section

    overrides: dict[str, Any] = {}
    if model and str(model).strip():
        overrides["model"] = str(model).strip()
    client = build_client(overrides or None)

    prompt = _build_user_prompt(
        topic=topic,
        genre=genre,
        worldview=worldview,
        story_core=story_core or {},
        characters=characters or [],
        synopsis=synopsis,
        volumes=volumes or [],
        section=section_name,
    )

    # 全量生成涉及四区块，需较大输出预算以免被截断导致 JSON 不完整
    max_tokens = 3000 if section_name else 8000
    params = {"max_tokens": max_tokens, "temperature": 0.8}

    # 部分 provider 偶发返回空内容或截断 JSON；重试整个 生成→解析 周期以提升成功率
    last_error: Optional[Exception] = None
    for _attempt in range(2):
        raw = client.generate(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
            params=params,
        )
        if not raw or not raw.strip():
            last_error = ModelClientError("模型未返回任何内容")
            continue
        try:
            obj = _parse_response(raw)
            return _extract_section(section_name, obj)
        except ValueError as exc:
            logger.warning("引导生成 JSON 解析失败，重试: %s", exc)
            last_error = ValueError("AI 生成结果无法解析，请重试")
            continue

    if isinstance(last_error, ValueError):
        raise last_error
    raise ModelClientError("模型未返回任何内容，请重试")
