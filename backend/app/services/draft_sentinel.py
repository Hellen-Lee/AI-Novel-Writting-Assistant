"""Draft 意图声明与判定。

历史上「本轮输出是正文还是闲聊」由事后启发式推断：读过正文（`reads_work`）或
输出超过 400 字就当作正文。审阅分析恰恰必须读稿、且天然超 400 字，于是被误判成
草稿卡，诱导用户把一篇分析插进正文。

改为**模型显式声明 + 预设意图 + Router 判定**的分层判定，默认偏非 draft：
把分析判成闲聊只是少一个按钮，把分析判成正文会产生脏数据，代价不对称。

声明形态是正文**首行**的 `[[DRAFT|insert_after|N]]` / `[[DRAFT|replace_range|a|b]]`；
末尾 `[[ANCHOR|...]]` 仍可解析（兼容旧输出），但 prompt 不再教模型输出。
"""

from __future__ import annotations

import re
from typing import Optional

# 预设意图：这些技能的输出一定是可直接落进正文的成稿。
DRAFT_PRESETS = {"续写", "润色", "扩写"}
# 这些技能产出设定条目（JSON），不是正文。
BUBBLE_PRESETS = {"生成设定"}

# 前导可忽略字符：空白与 BOM（模型/网关偶尔带出）。
_IGNORABLE = " \t\r\n\ufeff\u200b"
# 可能的哨兵前缀（用于判断"还没输完，继续缓冲"）。
_SENTINEL_PREFIX = "[[DRAFT"
# 首行 fence 行：```lang
_FENCE_RE = re.compile(r"```[A-Za-z0-9_+-]*[ \t]*\r?\n")
# 无进展缓冲上限：超过就当作正文，避免异常输入把正文一直扣住。
_HEAD_MAX_BUFFER = 512

_MODE = r"(?P<mode>insert_after|replace_range)"
_NUM = r"\s*(?P<start>\d+)(?:\s*\|\s*(?P<end>\d+))?"

# 首行声明哨兵。同时承载意图与落点，省掉一次「先声明再猜落点」的往返。
_HEAD_SENTINEL_RE = re.compile(
    r"\[\[\s*DRAFT\s*\|\s*" + _MODE + r"\s*\|" + _NUM + r"\s*\]\]",
    re.IGNORECASE,
)


def normalize_anchor(anchor: object) -> Optional[dict]:
    """校验/归一化锚对象为 {mode,startPara,endPara}（段号 1 起）；非法返回 None。"""
    if not isinstance(anchor, dict):
        return None
    mode = str(anchor.get("mode") or "").strip()
    if mode not in ("insert_after", "replace_range"):
        return None
    start = anchor.get("startPara")
    end = anchor.get("endPara", start)
    try:
        start = int(start)
        end = int(end)
    except (TypeError, ValueError):
        return None
    if start < 1 or end < start:
        return None
    return {"mode": mode, "startPara": start, "endPara": end}


def _anchor_from_match(match: "re.Match[str]") -> Optional[dict]:
    return normalize_anchor(
        {
            "mode": str(match.group("mode")).lower(),
            "startPara": int(match.group("start")),
            "endPara": (
                int(match.group("end"))
                if match.group("end") is not None
                else int(match.group("start"))
            ),
        }
    )


def parse_head_sentinel(text: str) -> Optional[dict]:
    """从文本首部解析声明哨兵，返回归一化锚；未命中返回 None。"""
    match = _HEAD_SENTINEL_RE.search(_skip_leading(text, allow_fence=True))
    if not match:
        return None
    return _anchor_from_match(match)


def _skip_leading(text: str, *, allow_fence: bool = False) -> str:
    """跳过前导空白/BOM；可选跳过一整个 fence 行，便于哨兵被围栏包裹时仍命中。"""
    rest = text.lstrip(_IGNORABLE)
    if allow_fence:
        fence = _FENCE_RE.match(rest)
        if fence:
            after = rest[fence.end():].lstrip(_IGNORABLE)
            if after.upper().startswith(_SENTINEL_PREFIX):
                return after
    return rest


def strip_head_sentinel(text: str) -> tuple[str, Optional[dict]]:
    """一键剥离首行哨兵，返回 (clean_text, anchor)。

    用于非流式路径（工具轮兜底正文）复用同一契约；不含哨兵时原样返回。
    """
    skipped = _skip_leading(text, allow_fence=True)
    offset = len(text) - len(skipped)
    match = _HEAD_SENTINEL_RE.match(skipped)
    if not match:
        return text, None
    anchor = _anchor_from_match(match)
    if anchor is None:
        return text, None
    return text[offset + match.end():].lstrip("\r\n"), anchor


def classify_output(
    *,
    declared_anchor: Optional[dict],
    preset: Optional[str],
    router_decision: str = "",
    legacy_anchor: Optional[dict] = None,
) -> str:
    """判定本轮输出是 "prose"（正文）还是 "chat"（闲聊/分析）。

    分层依据可信度降序；**没有任何信号时默认 chat**——启发式只能把输出升级成
    draft，而误升级的代价是把分析写进正文，所以宁可让用户手动「插入到正文」。

    `declared_anchor` 是模型在首行的显式声明（最强）；`legacy_anchor` 是旧契约
    末尾 `[[ANCHOR|...]]` 的解析结果，只作为弱信号——它的存在说明模型想标注落点，
    但仍可能属于「生成设定」这类非正文预设，故排在预设之后。
    """
    # 1. 模型显式声明，最强信号。
    if declared_anchor is not None:
        return "prose"
    # 2/3. 预设意图。
    if preset in DRAFT_PRESETS:
        return "prose"
    if preset in BUBBLE_PRESETS:
        return "chat"
    # 4. 旧契约的落点标注：说明模型在产出可落位的文本。
    if legacy_anchor is not None:
        return "prose"
    # 5. Router 已判讨论/澄清：不再给任何启发式翻盘的机会。
    if router_decision in {"chat", "clarify"}:
        return "chat"
    # 6. 无信号兜底（含 Router 被跳过、Router 报错）。
    return "chat"


class HeadSentinelScanner:
    """流式首行哨兵状态机。

    只在流最开头扫描：命中即剥离哨兵并把锚交给上层（草稿卡可在流式期间就落位）；
    未命中则把缓冲的前导文本原样吐回，保证正文逐字节不变。首个正文正文字符
    出现即**封口**，之后不再扫描，避免吃掉正文中同形的文本。
    """

    def __init__(self) -> None:
        self._buf = ""
        self._sealed = False
        self._trim_leading = False
        self.anchor: Optional[dict] = None

    @property
    def sealed(self) -> bool:
        """已封口：后续内容一律按正文透传。"""
        return self._sealed

    def feed(self, chunk: str) -> str:
        """喂入增量，返回可直接进入正文的文本。"""
        if self._sealed:
            return self._trim(chunk)
        self._buf += chunk
        return self._drain()

    def finish(self) -> str:
        """流结束：把仍未判定的缓冲当作正文吐出。"""
        if self._sealed:
            return ""
        self._seal()
        return self._take_buffer()

    def _trim(self, chunk: str) -> str:
        """声明哨兵之后，继续吃掉紧随其后的空行（可能落在下一个 chunk）。"""
        if not self._trim_leading:
            return chunk
        stripped = chunk.lstrip(_IGNORABLE)
        if stripped:
            self._trim_leading = False
        return stripped

    def _take_buffer(self) -> str:
        pending, self._buf = self._buf, ""
        return pending

    def _seal(self) -> None:
        self._sealed = True

    def _drain(self) -> str:
        body = _skip_leading(self._buf)
        # 全是前导空白：继续等，避免把可忽略前缀当正文吐出去。
        if not body:
            return self._give_up_if_stuck()

        fence = _FENCE_RE.match(body)
        if fence:
            after = body[fence.end():].lstrip(_IGNORABLE)
            if not after:
                return self._give_up_if_stuck()
            if after.upper().startswith(_SENTINEL_PREFIX):
                # 哨兵被围栏包裹：丢掉围栏，只从哨兵起点继续判定。
                return self._consume(body[fence.end():])

        return self._consume(body)

    def _give_up_if_stuck(self) -> str:
        if len(self._buf) > _HEAD_MAX_BUFFER:
            self._seal()
            return self._take_buffer()
        return ""

    def _consume(self, body: str) -> str:
        match = _HEAD_SENTINEL_RE.match(body)
        if match:
            anchor = _anchor_from_match(match)
            if anchor is not None:
                self.anchor = anchor
                self._seal()
                self._trim_leading = True
                return self._trim(body[match.end():].lstrip("\r\n"))

        if _looks_like_partial_sentinel(body):
            # 哨兵还没输完，继续缓冲。
            return ""

        # 不是哨兵：把缓冲原样当正文放行并封口。
        self._seal()
        return self._take_buffer()

    @staticmethod
    def strip(text: str) -> tuple[str, Optional[dict]]:
        """非流式便捷入口（等价于喂一次再 finish）。"""
        scanner = HeadSentinelScanner()
        head = scanner.feed(text)
        return head + scanner.finish(), scanner.anchor


def _looks_like_partial_sentinel(body: str) -> bool:
    """判断 body 是否可能是「尚未输完」的哨兵开头。"""
    normalized = re.sub(r"\s+", "", body).upper()
    if len(normalized) > len(_SENTINEL_PREFIX) + 16:
        return False
    if _SENTINEL_PREFIX.startswith(normalized):
        return True
    return normalized.startswith(_SENTINEL_PREFIX) and "]]" not in normalized
