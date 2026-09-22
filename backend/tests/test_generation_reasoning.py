"""A1~A3 生成思考透传与持久化测试。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import generation_service, project_store, run_store, session_store
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
