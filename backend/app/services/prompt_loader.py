"""Load plain-text prompts from app/prompts/*.md.

与 skill_loader 类似的"启动扫描 + 内存缓存"模式，但更简单：
- 纯正文 .md，无 frontmatter、无字段校验
- 文件名（不含 .md）即提示词唯一 key
- lru_cache 缓存；改 md 后需重启或调用 reload()
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

BUILTIN_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@lru_cache(maxsize=None)
def _load_all() -> dict[str, str]:
    """扫描 prompts 目录，返回 {文件名: 正文} 字典。"""
    prompts: dict[str, str] = {}
    if not BUILTIN_PROMPTS_DIR.exists():
        logger.warning("prompts 目录不存在: %s", BUILTIN_PROMPTS_DIR)
        return prompts
    for path in sorted(BUILTIN_PROMPTS_DIR.glob("*.md")):
        # 只处理目录直接子文件，不递归
        if path.parent != BUILTIN_PROMPTS_DIR:
            continue
        prompts[path.stem] = path.read_text(encoding="utf-8")
    return prompts


def get(name: str) -> str:
    """按文件名（不含 .md）取提示词；找不到抛 KeyError。"""
    return _load_all()[name]


def reload() -> None:
    """清缓存，下次 get 重新读盘（留作以后做热重载接口）。"""
    _load_all.cache_clear()
