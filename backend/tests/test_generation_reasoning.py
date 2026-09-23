"""A1~A3 生成思考透传与持久化测试。"""

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
    reasoning_store,
    run_store,
    session_store,
)
from app.services.model_client import ModelClient


class FakeClient:
    def __init__(self, reasoning: tuple[str, ...] = (), content: str = "") -> None:
        self.reasoning = reasoning
        self.content = content

    def chat(self, **_: object) -> dict:
        return {"content": "", "tool_calls": []}

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
        session_text = json.dumps(session, ensure_ascii=False)
        self.assertNotIn("先观察", session_text)
        self.assertNotIn("再承接", session_text)
        self.assertEqual(session["messages"][-1]["content"], content)

    def test_non_reasoning_model_does_not_add_reasoning_field(self) -> None:
        self.run_turn(FakeClient((), "普通模型正文"))

        self.assertNotIn("reasoning", self.agent_step())

    def test_tool_round_replays_reasoning_content_in_follow_up_messages(self) -> None:
        client = ToolAwareFakeClient("工具结果正文")
        with patch.object(
            generation_service.agent_tools,
            "execute_tool",
            return_value={"tool_call_id": "call_test", "content": "大纲内容"},
        ):
            self.run_turn(client, user_input="请读取大纲后继续")

        self.assertGreaterEqual(len(client.chat_messages), 2)
        follow_up = client.chat_messages[1]
        assistant = next(message for message in follow_up if message["role"] == "assistant")
        self.assertEqual(assistant["reasoning_content"], "工具决策思考")

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


if __name__ == "__main__":
    unittest.main()
