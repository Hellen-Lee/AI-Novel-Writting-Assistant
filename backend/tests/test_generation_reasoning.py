"""A1~A3 生成思考透传与 D 工具轮流式化测试。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers import agent_viewer
from app.services import (
    generation_service,
    project_store,
    prompt_builder,
    reasoning_store,
    run_store,
    session_store,
)
from app.services.model_client import ModelClient, ModelClientError


class FakeClient:
    def __init__(self, reasoning: tuple[str, ...] = (), content: str = "") -> None:
        self.reasoning = reasoning
        self.content = content

    def chat(self, **_: object) -> dict:
        return {"content": "", "tool_calls": []}

    def chat_stream_tools(self, **_: object):
        # 工具轮无调用时直接结束；reasoning 测试关注最终正文流。
        yield {"type": "done", "finish_reason": "stop"}

    def chat_stream(self, **_: object):
        for text in self.reasoning:
            yield {"type": "reasoning", "text": text}
        if self.content:
            yield {"type": "content", "text": self.content}
        yield {"type": "done", "finish_reason": "stop"}


class ToolAwareFakeClient(FakeClient):
    def __init__(self, content: str = "") -> None:
        super().__init__(content=content)
        self.chat_messages: list[list[dict]] = []

    def chat(self, messages=None, **_: object) -> dict:
        snapshot = json.loads(json.dumps(messages or [], ensure_ascii=False))
        self.chat_messages.append(snapshot)
        if len(self.chat_messages) == 1:
            return {
                "content": "",
                "reasoning_content": "工具决策思考",
                "tool_calls": [
                    {
                        "id": "call_test",
                        "type": "function",
                        "function": {
                            "name": "get_outline",
                            "arguments": "{}",
                        },
                    }
                ],
            }
        return {"content": "", "tool_calls": []}

    def chat_stream_tools(self, messages=None, **_: object):
        assistant = self.chat(messages=messages)
        if assistant.get("reasoning_content"):
            yield {
                "type": "reasoning",
                "text": assistant["reasoning_content"],
            }
        for call in assistant.get("tool_calls") or []:
            function = call["function"]
            yield {
                "type": "tool_call",
                "index": 0,
                "id": call["id"],
                "name": function["name"],
                "arguments": function["arguments"][:1],
            }
            yield {
                "type": "tool_call",
                "index": 0,
                "arguments": function["arguments"][1:],
            }
        yield {
            "type": "done",
            "finish_reason": "tool_calls" if assistant.get("tool_calls") else "stop",
        }


class StreamRejectingToolClient(FakeClient):
    def __init__(self) -> None:
        super().__init__(content="回退后的正文")
        self.fallback_calls = 0

    def chat_stream_tools(self, **_: object):
        raise ModelClientError("stream + tools 不支持")

    def chat(self, **_: object) -> dict:
        self.fallback_calls += 1
        return {"content": "", "tool_calls": []}


class InterruptingToolClient(FakeClient):
    def chat_stream_tools(self, **_: object):
        yield {"type": "reasoning", "text": "工具轮思考已开始"}
        yield {"type": "done", "finish_reason": "tool_calls"}


class ChunkedClient(FakeClient):
    """按给定分片流式输出，且可让工具轮先读一次正文。"""

    def __init__(
        self,
        chunks: list[str],
        *,
        read_work: bool = False,
        router_decision: str = "chat",
    ) -> None:
        super().__init__(content="")
        self.chunks = chunks
        self.read_work = read_work
        self.router_decision = router_decision
        self.tool_rounds = 0

    def generate(self, **_: object) -> str:
        return json.dumps(
            {"decision": self.router_decision, "skill_name": "", "reason": "test"}
        )

    def chat(self, **_: object) -> dict:
        return {"content": "", "tool_calls": []}

    def chat_stream_tools(self, **_: object):
        self.tool_rounds += 1
        if self.read_work and self.tool_rounds == 1:
            yield {
                "type": "tool_call",
                "index": 0,
                "id": "call_read",
                "name": "read_chapter",
                "arguments": "{}",
            }
            yield {"type": "done", "finish_reason": "tool_calls"}
            return
        yield {"type": "done", "finish_reason": "stop"}

    def chat_stream(self, **_: object):
        for chunk in self.chunks:
            yield {"type": "content", "text": chunk}
        yield {"type": "done", "finish_reason": "stop"}


def parse_frames(frames: list[str]) -> list[dict]:
    events = []
    for frame in frames:
        if not frame.startswith("data: ") or frame.strip() == "data: [DONE]":
            continue
        events.append(json.loads(frame[6:]))
    return events


class ModelClientReasoningTest(unittest.TestCase):
    def test_iter_chat_deltas_supports_reasoning_aliases_and_mixed_chunks(self) -> None:
        payloads = [
            {"choices": [{"delta": {"reasoning_content": "先想", "reasoning": "忽略"}}]},
            {"choices": [{"delta": {"content": "正文"}}]},
            {"choices": [{"delta": {"reasoning": "再想"}}]},
            {"choices": [{"delta": {}, "finish_reason": "stop"}]},
        ]
        raw = "".join(
            f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            for payload in payloads
        )
        raw += "data: [DONE]\n\n"
        response = httpx.Response(
            200,
            content=raw.encode("utf-8"),
            request=httpx.Request("POST", "http://test.local"),
        )

        events = list(ModelClient._iter_chat_deltas(response))

        self.assertEqual(
            events,
            [
                {"type": "reasoning", "text": "先想"},
                {"type": "content", "text": "正文"},
                {"type": "reasoning", "text": "再想"},
                {"type": "done", "finish_reason": "stop"},
                {"type": "done", "finish_reason": ""},
            ],
        )

    def test_chat_preserves_reasoning_content_for_tool_round(self) -> None:
        client = ModelClient(
            {
                "api_base": "http://test.local/v1",
                "api_key": "sk-test",
                "model": "test-model",
            }
        )
        response = {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "reasoning_content": "先判断是否需要工具",
                        "tool_calls": [],
                    }
                }
            ]
        }
        with patch.object(client, "_request", return_value=response):
            result = client.chat(
                messages=[{"role": "user", "content": "读取大纲"}],
                tools=[{"type": "function", "function": {"name": "get_outline"}}],
            )

        self.assertEqual(result["reasoning_content"], "先判断是否需要工具")

    def test_chat_stream_tools_reuses_normalized_tool_delta_channel(self) -> None:
        client = ModelClient(
            {
                "api_base": "http://test.local/v1",
                "api_key": "sk-test",
                "model": "test-model",
            }
        )
        expected = [
            {"type": "reasoning", "text": "先判断"},
            {
                "type": "tool_call",
                "index": 0,
                "id": "call_test",
                "name": "get_outline",
                "arguments": "{}",
            },
            {"type": "done", "finish_reason": "tool_calls"},
        ]
        with patch.object(client, "chat_stream", return_value=iter(expected)):
            actual = list(
                client.chat_stream_tools(
                    messages=[{"role": "user", "content": "读取大纲"}],
                    tools=[{"type": "function"}],
                    tool_choice="auto",
                )
            )

        self.assertEqual(actual, expected)


class AgentViewerAccessTest(unittest.TestCase):
    def test_agent_viewer_rejects_non_local_client(self) -> None:
        request = SimpleNamespace(
            client=SimpleNamespace(host="192.168.1.20"),
        )

        with self.assertRaises(HTTPException) as context:
            agent_viewer._require_local_request(request)

        self.assertEqual(context.exception.status_code, 403)


class GenerationReasoningTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="ainovel_reasoning_")
        self.projects_dir = Path(self.temp_dir.name) / "projects"
        self.project_patch = patch.object(project_store, "PROJECTS_DIR", self.projects_dir)
        self.project_patch.start()

        project = project_store.create_project(name="思考透传测试")
        self.project_id = project["meta"]["id"]
        self.session_id = session_store.create_session(self.project_id, "测试会话")["id"]

        self.config_patch = patch.object(
            generation_service,
            "load_config",
            return_value={
                "api_base": "http://fake.local/v1",
                "api_key": "sk-test",
                "model": "fake-model",
                "context_window": 131072,
                "temperature": 0.7,
                "top_p": 0.9,
                "max_tokens": 2048,
                "enable_agent_tools": True,
            },
        )
        self.config_patch.start()

    def tearDown(self) -> None:
        self.config_patch.stop()
        self.project_patch.stop()
        self.temp_dir.cleanup()

    def run_turn(self, client: FakeClient, user_input: str = "测试生成") -> list[str]:
        with patch.object(generation_service, "build_client", return_value=client):
            return list(
                generation_service.iter_generate(
                    self.project_id,
                    session_id=self.session_id,
                    skill_name="续写",
                    user_input=user_input,
                )
            )

    def agent_step(self) -> dict:
        runs = run_store.list_runs_for_session(self.project_id, self.session_id)
        return next(
            step
            for run in runs
            for step in run["steps"]
            if step.get("mode") == "agent" and not step.get("aborted")
        )

    def test_reasoning_sse_and_run_store_are_separated_from_session_content(self) -> None:
        content = "夜色压过旧城区的屋脊。"
        events = parse_frames(
            self.run_turn(FakeClient(("先观察", "再承接"), content))
        )

        self.assertEqual(
            [event["text"] for event in events if event["type"] == "thinking"],
            ["先观察", "再承接"],
        )
        self.assertEqual(
            "".join(event["content"] for event in events if event["type"] == "content"),
            content,
        )

        step = self.agent_step()
        self.assertEqual(step["reasoning"], "先观察再承接")
        self.assertEqual(step["response"], content)
        self.assertEqual(step["chars_est"]["response"], len(content))

        session = session_store.get_session(self.project_id, self.session_id)
        assistant = session["messages"][-1]
        # 思考落到独立元字段，供刷新后回显；正文与字数统计不受影响。
        self.assertEqual(assistant["thinking"], "先观察再承接")
        self.assertEqual(assistant["content"], content)

    def test_persisted_thinking_does_not_enter_history_or_summary(self) -> None:
        self.run_turn(FakeClient(("内部推理线索",), "正文段落"))

        session = session_store.get_session(self.project_id, self.session_id)
        history = prompt_builder.build_history_block(session)
        self.assertNotIn("内部推理线索", history)
        self.assertIn("正文段落", history)
        self.assertNotIn(
            "内部推理线索", session_store.format_messages_for_summary(session["messages"])
        )

    def test_non_reasoning_model_does_not_add_reasoning_field(self) -> None:
        self.run_turn(FakeClient((), "普通模型正文"))

        self.assertNotIn("reasoning", self.agent_step())
        assistant = session_store.get_session(self.project_id, self.session_id)[
            "messages"
        ][-1]
        self.assertNotIn("thinking", assistant)

    def test_persisted_thinking_is_bounded_for_switch_session_payload(self) -> None:
        long_reasoning = "思" * (generation_service.MESSAGE_THINKING_MAX_CHARS + 500)
        self.run_turn(FakeClient((long_reasoning,), "正文"))

        assistant = session_store.get_session(self.project_id, self.session_id)[
            "messages"
        ][-1]
        self.assertEqual(
            len(assistant["thinking"]),
            generation_service.MESSAGE_THINKING_MAX_CHARS,
        )
        self.assertTrue(
            assistant["thinking"].endswith(
                generation_service.MESSAGE_THINKING_SUFFIX
            )
        )
        # 正文不受思考长度影响
        self.assertEqual(assistant["content"], "正文")

    def test_tool_round_replays_reasoning_content_in_follow_up_messages(self) -> None:
        client = ToolAwareFakeClient("工具结果正文")
        with patch.object(
            generation_service.agent_tools,
            "execute_tool",
            return_value={"tool_call_id": "call_test", "content": "大纲内容"},
        ):
            frames = self.run_turn(client, user_input="请读取大纲后继续")

        self.assertGreaterEqual(len(client.chat_messages), 2)
        follow_up = client.chat_messages[1]
        assistant = next(message for message in follow_up if message["role"] == "assistant")
        self.assertEqual(assistant["reasoning_content"], "工具决策思考")

        events = parse_frames(frames)
        thinking = [event for event in events if event["type"] == "thinking"]
        self.assertEqual(
            thinking[0],
            {"type": "thinking", "text": "工具决策思考", "phase": "tool_round"},
        )
        self.assertTrue(any(event["type"] == "tool_progress" for event in events))
        assistant_message = session_store.get_session(self.project_id, self.session_id)[
            "messages"
        ][-1]
        self.assertIn("工具决策思考", assistant_message["thinking"])
        self.assertNotIn("工具决策思考", assistant_message["content"])
        tool_steps = [
            step
            for run in run_store.list_runs_for_session(self.project_id, self.session_id)
            for step in run["steps"]
            if step.get("mode") == "agent_tool"
        ]
        self.assertEqual(tool_steps[0]["reasoning"], "工具决策思考")
        self.assertEqual(
            tool_steps[0]["tools"][0]["function"]["name"],
            "get_outline",
        )

    def test_stream_tools_falls_back_to_non_stream_once(self) -> None:
        client = StreamRejectingToolClient()
        self.run_turn(client, user_input="测试 stream tools 回退")

        self.assertEqual(client.fallback_calls, 1)
        runs = run_store.list_runs_for_session(self.project_id, self.session_id)
        tool_steps = [
            step
            for run in runs
            for step in run["steps"]
            if step.get("mode") == "agent_tool"
        ]
        self.assertTrue(tool_steps)
        self.assertTrue(tool_steps[-1].get("stream_fallback"))

    def test_interrupted_tool_stream_persists_partial_reasoning(self) -> None:
        generator = generation_service.iter_generate(
            self.project_id,
            session_id=self.session_id,
            skill_name="续写",
            user_input="中断工具思考",
        )
        with patch.object(
            generation_service,
            "build_client",
            return_value=InterruptingToolClient(),
        ):
            for frame in generator:
                event = json.loads(frame[6:]) if frame.startswith("data: ") else {}
                if event.get("type") == "thinking":
                    break
        generator.close()

        runs = run_store.list_runs_for_session(self.project_id, self.session_id)
        aborted = [
            step
            for run in runs
            for step in run["steps"]
            if step.get("mode") == "agent_tool" and step.get("aborted")
        ]
        self.assertEqual(len(aborted), 1)
        self.assertEqual(aborted[0]["reasoning"], "工具轮思考已开始")

    def test_run_store_caps_persisted_reasoning(self) -> None:
        long_reasoning = "思考" * run_store.REASONING_PERSIST_MAX_CHARS
        step = run_store.make_step(
            "agent",
            extra={"reasoning": long_reasoning},
        )

        self.assertEqual(step["reasoning"], long_reasoning)

        stored = run_store.save_run(
            self.project_id,
            session_id=self.session_id,
            run_id="run_reasoning_cap",
            steps=[{"mode": "agent", "reasoning": long_reasoning}],
        )
        persisted_step = stored["steps"][0]
        self.assertTrue(persisted_step["reasoning_truncated"])
        self.assertLessEqual(
            persisted_step["reasoning_ref"]["chars"],
            run_store.REASONING_PERSIST_MAX_CHARS,
        )
        self.assertEqual(persisted_step["reasoning_ref"]["status"], "partial")
        loaded = reasoning_store.read_reasoning(
            self.project_id,
            "run_reasoning_cap",
            0,
            reference=persisted_step["reasoning_ref"],
        )
        self.assertEqual(
            loaded["text"],
            long_reasoning[: run_store.REASONING_PERSIST_MAX_CHARS],
        )

    def test_delete_session_removes_run_ledgers(self) -> None:
        run_store.save_run(
            self.project_id,
            session_id=self.session_id,
            run_id="run_delete_test",
            steps=[{"mode": "agent", "reasoning": "待清理的思考"}],
        )
        sidecar = (
            self.projects_dir
            / self.project_id
            / "agent"
            / "reasoning"
            / "run_delete_test"
            / "step_0.txt.gz"
        )
        self.assertTrue(sidecar.is_file())

        session_store.delete_session(self.project_id, self.session_id)

        self.assertEqual(
            run_store.list_runs_for_session(self.project_id, self.session_id),
            [],
        )
        self.assertFalse(sidecar.exists())

    def test_run_reasoning_limit_is_shared_across_steps(self) -> None:
        with patch.object(
            reasoning_store,
            "load_config",
            return_value={
                "reasoning_step_max_chars": 5,
                "reasoning_run_max_chars": 7,
                "reasoning_project_quota_bytes": 1024 * 1024,
                "reasoning_retention_runs": 20,
            },
        ):
            stored = run_store.save_run(
                self.project_id,
                session_id=self.session_id,
                run_id="run_shared_reasoning_limit",
                steps=[
                    {"mode": "agent_tool", "reasoning": "abcdefghij"},
                    {"mode": "agent", "reasoning": "klmnopqrst"},
                ],
            )

        self.assertEqual(stored["steps"][0]["reasoning_ref"]["chars"], 5)
        self.assertEqual(stored["steps"][1]["reasoning_ref"]["chars"], 2)
        self.assertTrue(stored["steps"][1]["reasoning_ref"]["truncated"])

    def test_interrupted_stream_persists_partial_reasoning(self) -> None:
        generator = generation_service.iter_generate(
            self.project_id,
            session_id=self.session_id,
            skill_name="续写",
            user_input="中断测试",
        )
        with patch.object(
            generation_service,
            "build_client",
            return_value=FakeClient(("思考开头", "思考后半"), "正文"),
        ):
            # build_client 在生成器真正执行 next() 时才会调用，因此补丁需覆盖消费过程。
            for frame in generator:
                event = json.loads(frame[6:]) if frame.startswith("data: ") else {}
                if event.get("type") == "thinking" and event.get("text") == "思考后半":
                    break
        generator.close()

        runs = run_store.list_runs_for_session(self.project_id, self.session_id)
        aborted = [
            step
            for run in runs
            for step in run["steps"]
            if step.get("aborted")
        ]
        self.assertEqual(len(aborted), 1)
        self.assertEqual(aborted[0]["reasoning"], "思考开头思考后半")


def draft_flags(events: list[dict]) -> list[bool]:
    return [
        event["draft"]
        for event in events
        if event.get("type") == "meta" and "draft" in event
    ]


class DraftClassificationTest(GenerationReasoningTest):
    """端到端回归：非正文内容不得被归入 draft 卡片（方案 B+C）。"""

    def run_free_text(
        self,
        client: FakeClient,
        user_input: str = "请评估这一章的完整性",
    ) -> list[dict]:
        with patch.object(generation_service, "build_client", return_value=client):
            frames = list(
                generation_service.iter_generate(
                    self.project_id,
                    session_id=self.session_id,
                    user_input=user_input,
                )
            )
        return parse_frames(frames)

    def test_long_review_after_reading_work_is_not_a_draft(self) -> None:
        """截图场景：读过正文 + 长篇审阅分析 → 必须走气泡，不能进草稿卡。

        旧实现里 reads_work 单信号成判，这种输出必然被误判成 draft。
        """
        review = (
            "本章功能完整——清嘉报信、公主决意、废园取证、半枚鱼符到手。"
            "作为「拿到第一件关键证物」的功能章，它站得住。但有三处硬伤："
            "一是体量失衡；二是一日之内塞了太多环节；三是和第一章的钩子断了。"
        )
        events = self.run_free_text(
            ChunkedClient([review], read_work=True),
            user_input="评估第二章的完整性，给出修改建议",
        )
        self.assertTrue(draft_flags(events), "应有 meta 帧携带 draft")
        self.assertFalse(draft_flags(events)[-1], "审阅分析不应判为 draft")
        self.assertFalse(
            any(event.get("type") == "draft_hint" for event in events),
            "未声明成稿时不应发出 draft_hint",
        )

    def test_declared_head_sentinel_opens_draft_with_anchor(self) -> None:
        """模型首行声明成稿 → 提前 draft_hint + 锚，正文不含哨兵。"""
        events = self.run_free_text(
            ChunkedClient(
                ["[[DRAFT|insert_after|5]]", "\n他抬起头，雪落进衣领。"],
                read_work=True,
            ),
            user_input="接着往下写",
        )
        hints = [event for event in events if event.get("type") == "draft_hint"]
        self.assertEqual(len(hints), 1, "声明哨兵应触发一次 draft_hint")
        self.assertTrue(hints[0]["draft"])
        self.assertEqual(
            hints[0]["content_anchor"],
            {"mode": "insert_after", "startPara": 5, "endPara": 5},
        )
        body = "".join(
            event["content"] for event in events if event.get("type") == "content"
        )
        self.assertNotIn("[[DRAFT", body, "哨兵不得出现在正文里")
        self.assertIn("雪落进衣领", body)
        self.assertTrue(draft_flags(events)[-1], "声明成稿应判为 draft")

    def test_declaration_is_not_assumed_for_long_undeclared_text(self) -> None:
        """无信号的长正文不再靠长度猜：落回只读气泡（判定后不提供转正文路径）。"""
        prose = "夜色压过旧城区的屋脊。他沿着河堤走了很久，直到天边泛白。" * 30
        events = self.run_free_text(ChunkedClient([prose]), user_input="随便写点")
        self.assertFalse(draft_flags(events)[-1])
        body = "".join(
            event["content"] for event in events if event["type"] == "content"
        )
        self.assertEqual(body, prose, "未声明时正文必须逐字透传")

    def test_preset_still_yields_draft_without_declaration(self) -> None:
        """快捷指令不受影响：点「续写」仍是草稿卡。"""
        with patch.object(
            generation_service, "build_client", return_value=FakeClient((), "续写正文")
        ):
            frames = list(
                generation_service.iter_generate(
                    self.project_id,
                    session_id=self.session_id,
                    skill_name="续写",
                    user_input="请续写",
                )
            )
        self.assertTrue(draft_flags(parse_frames(frames))[-1])

    def test_selection_anchor_dropped_when_not_a_draft(self) -> None:
        """选段提问时不得回传选区锚，否则气泡会带「替换该段」按钮。"""
        events = self.run_free_text(
            ChunkedClient(["这段写得不错，但节奏偏快。"], read_work=True),
            user_input="这段写得如何？",
        )
        metas = [event for event in events if event.get("type") == "meta"]
        self.assertEqual(metas[-1].get("content_anchor"), None)


if __name__ == "__main__":
    unittest.main()
