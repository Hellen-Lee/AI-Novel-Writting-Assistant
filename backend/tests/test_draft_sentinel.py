"""draft 判定与首行声明哨兵测试（方案 B+C）。

覆盖回归点：审阅分析（必须读稿、天然超长）不得再被启发式判成正文草稿。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import draft_sentinel as ds


class ClassifyOutputTest(unittest.TestCase):
    """分层判定：模型声明 > 预设意图 > Router 判定 > 默认闲聊。"""

    def test_declared_anchor_wins_over_router_chat(self) -> None:
        anchor = {"mode": "insert_after", "startPara": 3, "endPara": 3}
        self.assertEqual(
            ds.classify_output(
                declared_anchor=anchor, preset=None, router_decision="chat"
            ),
            "prose",
        )

    def test_draft_presets_are_prose(self) -> None:
        for preset in ("续写", "润色", "扩写"):
            self.assertEqual(
                ds.classify_output(declared_anchor=None, preset=preset), "prose"
            )

    def test_bubble_preset_is_chat(self) -> None:
        self.assertEqual(
            ds.classify_output(declared_anchor=None, preset="生成设定"), "chat"
        )

    def test_router_chat_is_not_overridden_by_any_heuristic(self) -> None:
        """核心回归：截图场景——读过正文 + 长篇审阅分析。

        旧实现里 reads_work 或长度启发式会把这种输出判成 draft；新判定只看
        Router 的结论，模型遵守「讨论时不输出正文」的规则后不会再被判错。
        """
        long_review = "本章功能完整——清嘉报信、公主决意、废园取证、半枚鱼符到手。" * 40
        self.assertGreater(len(long_review), 400)
        self.assertEqual(
            ds.classify_output(
                declared_anchor=None, preset=None, router_decision="chat"
            ),
            "chat",
        )

    def test_router_clarify_is_chat(self) -> None:
        self.assertEqual(
            ds.classify_output(
                declared_anchor=None, preset=None, router_decision="clarify"
            ),
            "chat",
        )

    def test_no_signal_defaults_to_chat(self) -> None:
        """默认偏非 draft：升级只能由模型显式声明发起。"""
        self.assertEqual(ds.classify_output(declared_anchor=None, preset=None), "chat")
        self.assertEqual(
            ds.classify_output(
                declared_anchor=None, preset=None, router_decision="skill"
            ),
            "chat",
        )

    def test_legacy_anchor_is_prose_but_ranks_below_preset(self) -> None:
        """旧契约末尾 ANCHOR 是弱信号：说明模型想落位，但仍让预设说话。"""
        legacy = {"mode": "insert_after", "startPara": 2, "endPara": 2}
        self.assertEqual(
            ds.classify_output(
                declared_anchor=None, preset=None, legacy_anchor=legacy
            ),
            "prose",
        )
        self.assertEqual(
            ds.classify_output(
                declared_anchor=None, preset="生成设定", legacy_anchor=legacy
            ),
            "chat",
        )
        self.assertEqual(
            ds.classify_output(
                declared_anchor=None,
                preset=None,
                router_decision="chat",
                legacy_anchor=legacy,
            ),
            "prose",
        )

    def test_declared_anchor_outranks_bubble_preset(self) -> None:
        anchor = {"mode": "insert_after", "startPara": 1, "endPara": 1}
        self.assertEqual(
            ds.classify_output(declared_anchor=anchor, preset="生成设定"), "prose"
        )

    def test_legacy_router_decision_skill_still_chat_without_declaration(self) -> None:
        # Router 选了 skill 会把 preset 填上，未填说明未命中；不应视为正文。
        self.assertEqual(
            ds.classify_output(
                declared_anchor=None, preset=None, router_decision=""
            ),
            "chat",
        )


class NormalizeAnchorTest(unittest.TestCase):
    def test_valid_anchor(self) -> None:
        self.assertEqual(
            ds.normalize_anchor(
                {"mode": "replace_range", "startPara": 1, "endPara": 5}
            ),
            {"mode": "replace_range", "startPara": 1, "endPara": 5},
        )

    def test_end_defaults_to_start(self) -> None:
        self.assertEqual(
            ds.normalize_anchor({"mode": "insert_after", "startPara": 4}),
            {"mode": "insert_after", "startPara": 4, "endPara": 4},
        )

    def test_rejects_bad_input(self) -> None:
        for bad in (
            None,
            "insert_after",
            {"mode": "delete", "startPara": 1},
            {"mode": "insert_after", "startPara": 0},
            {"mode": "insert_after", "startPara": 5, "endPara": 2},
            {"mode": "insert_after", "startPara": "x"},
        ):
            self.assertIsNone(ds.normalize_anchor(bad), f"应拒绝：{bad!r}")


class HeadSentinelScannerTest(unittest.TestCase):
    """流式首行状态机：命中即剥离，未命中逐字节透传。"""

    def run_chunks(self, chunks: list[str]) -> tuple[str, object]:
        scanner = ds.HeadSentinelScanner()
        out = "".join(scanner.feed(chunk) for chunk in chunks) + scanner.finish()
        return out, scanner.anchor

    def test_declaration_stripped_and_anchor_returned(self) -> None:
        out, anchor = self.run_chunks(["[[DRAFT|insert_after|5]]", "正文内容"])
        self.assertEqual(out, "正文内容")
        self.assertEqual(anchor, {"mode": "insert_after", "startPara": 5, "endPara": 5})

    def test_sentinel_split_across_chunks(self) -> None:
        out, anchor = self.run_chunks(
            ["[[DRA", "FT|replace_range|1|3]]", "\n新正文"]
        )
        self.assertEqual(out, "新正文")
        self.assertEqual(
            anchor, {"mode": "replace_range", "startPara": 1, "endPara": 3}
        )

    def test_leading_blank_lines_tolerated(self) -> None:
        out, anchor = self.run_chunks(["\n\n", "  ", "[[DRAFT|insert_after|2]]正文"])
        self.assertEqual(out, "正文")
        self.assertEqual(anchor, {"mode": "insert_after", "startPara": 2, "endPara": 2})

    def test_plain_body_passes_through_unchanged(self) -> None:
        body = "夜色压过旧城区的屋脊。\n\n他抬起头。"
        out, anchor = self.run_chunks([body[:5], body[5:]])
        self.assertEqual(out, body)
        self.assertIsNone(anchor)

    def test_bracket_like_text_is_not_eaten(self) -> None:
        for body in ("[1] 这是正文", "[[ANCHOR|insert_after|2]]正文", "[[草稿]]正文"):
            out, anchor = self.run_chunks([body])
            self.assertEqual(out, body, f"正文被改写：{body!r}")
            self.assertIsNone(anchor)

    def test_sealed_after_body_so_later_sentinel_is_kept(self) -> None:
        """封口后不再扫描：正文中间出现的同形文本必须原样保留。"""
        out, anchor = self.run_chunks(
            ["第一段正文。", "[[DRAFT|insert_after|9]]后文"]
        )
        self.assertEqual(out, "第一段正文。[[DRAFT|insert_after|9]]后文")
        self.assertIsNone(anchor)

    def test_invalid_segment_numbers_fall_back_to_body(self) -> None:
        """段号非法（0）时不认声明，整段按正文透传。"""
        body = "[[DRAFT|insert_after|0]]正文"
        out, anchor = self.run_chunks([body])
        self.assertEqual(out, body)
        self.assertIsNone(anchor)

    def test_fence_wrapped_declaration(self) -> None:
        out, anchor = self.run_chunks(["```markdown\n[[DRAFT|insert_after|2]]\n正文"])
        self.assertEqual(out, "正文")
        self.assertEqual(anchor, {"mode": "insert_after", "startPara": 2, "endPara": 2})

    def test_empty_stream_yields_empty_body(self) -> None:
        out, anchor = self.run_chunks([])
        self.assertEqual(out, "")
        self.assertIsNone(anchor)

    def test_static_strip_helper_matches_scanner(self) -> None:
        clean, anchor = ds.HeadSentinelScanner.strip("[[DRAFT|insert_after|7]]成稿")
        self.assertEqual(clean, "成稿")
        self.assertEqual(anchor, {"mode": "insert_after", "startPara": 7, "endPara": 7})

    def test_strip_head_sentinel_leaves_plain_text_alone(self) -> None:
        text = "普通正文，没有声明。"
        self.assertEqual(ds.strip_head_sentinel(text), (text, None))


class ParseHeadSentinelTest(unittest.TestCase):
    def test_parses_and_ignores_trailing_body(self) -> None:
        anchor = ds.parse_head_sentinel("[[DRAFT|replace_range|2|4]]\n正文")
        self.assertEqual(
            anchor, {"mode": "replace_range", "startPara": 2, "endPara": 4}
        )

    def test_returns_none_for_body_only(self) -> None:
        self.assertIsNone(ds.parse_head_sentinel("正文里提到 [[DRAFT]] 但不在首行，见上文"))
        self.assertIsNone(ds.parse_head_sentinel(""))


if __name__ == "__main__":
    unittest.main()
