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
from string import Template
from typing import Any, Optional

from app.models.schemas import OnboardingSection
from app.services.model_client import ModelClientError, build_client
from app.services import prompt_loader

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = prompt_loader.get("onboarding_system")

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
            "\n" + Template(prompt_loader.get("onboarding_user_section")).safe_substitute(
                section_label=labels[section]
            )
        )
    else:
        parts.append("\n" + prompt_loader.get("onboarding_user_full"))

    parts.append("\n" + prompt_loader.get("onboarding_user_json_spec"))

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

    # 输出预算：推理类模型（DeepSeek-R1 系 / o1 系）的思考 token 同样计入
    # max_tokens，预算不足时会返回 finish_reason="length" 且 content 为空。
    # 因此首轮给足预算，并在检测到「被截断/空内容」时逐轮扩容重试。
    base_tokens = 6000 if section_name else 16000
    max_attempts = 3

    last_error: Optional[Exception] = None
    for attempt in range(max_attempts):
        max_tokens = base_tokens * (attempt + 1)
        params = {"max_tokens": max_tokens, "temperature": 0.8}
        try:
            result = client.generate_detailed(
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
                params=params,
                timeout=180.0,
            )
        except ModelClientError as exc:
            logger.warning("引导生成调用失败（第 %d 次）: %s", attempt + 1, exc)
            last_error = exc
            continue

        raw = result["content"]
        truncated = result["finish_reason"] == "length"
        if not raw.strip():
            # 推理耗尽预算 → 下一轮更大预算重试
            logger.warning(
                "引导生成返回空内容（第 %d 次，finish_reason=%s, max_tokens=%d），扩容重试",
                attempt + 1,
                result["finish_reason"] or "unknown",
                max_tokens,
            )
            last_error = ModelClientError("模型未返回任何内容")
            continue

        try:
            obj = _parse_response(raw)
        except ValueError as exc:
            # 截断造成的 JSON 不完整同样靠扩容重试解决
            logger.warning(
                "引导生成 JSON 解析失败（第 %d 次，truncated=%s）: %s",
                attempt + 1,
                truncated,
                exc,
            )
            last_error = ValueError("AI 生成结果无法解析，请重试")
            continue

        try:
            return _extract_section(section_name, obj)
        except KeyError as exc:
            logger.warning("引导生成区块缺失: %s", exc)
            last_error = ValueError("AI 生成结果缺少所需字段，请重试")
            continue

    if isinstance(last_error, ValueError):
        raise last_error
    if isinstance(last_error, ModelClientError):
        raise last_error
    raise ModelClientError("模型未返回任何内容，请重试")
