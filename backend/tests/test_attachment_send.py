"""E1~E4 附件发送链路的离线单元检查。

运行：python backend/tests/test_attachment_send.py
"""

from __future__ import annotations

import unittest
import sys
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.schemas import GenerateRequest
from app.services import project_store, prompt_builder, session_store


class AttachmentSendTest(unittest.TestCase):
    def test_generate_request_requires_text_and_limits_attachments(self) -> None:
        request = GenerateRequest(
            session_id="sess_test",
            user_input="  请总结附件  ",
            attachments=["att_1", "att_2"],
        )
        self.assertEqual(request.user_input, "请总结附件")
        with self.assertRaises(ValueError):
            GenerateRequest(session_id="sess_test", user_input="   ")
        with self.assertRaises(ValueError):
            GenerateRequest(
                session_id="sess_test",
                user_input="请求",
                attachments=["a1", "a2", "a3", "a4", "a5", "a6"],
            )

    def test_materials_keep_order_and_show_fallbacks(self) -> None:
        records = [
            {
                "id": "att_text",
                "type": "file",
                "name": "设定.txt",
                "parsed": {"text": "人物住在旧城区。"},
            },
            {
                "id": "att_image",
                "type": "image",
                "name": "地图.png",
                "parsed": {"width": 100, "height": 80},
            },
        ]
        materials = prompt_builder.format_attachment_materials(records)
        self.assertLess(materials.index("设定.txt"), materials.index("地图.png"))
        self.assertIn("人物住在旧城区", materials)
        self.assertIn("未启用识图能力", materials)

    def test_message_stores_attachment_summary_and_selection(self) -> None:
        message = session_store.make_message(
            "user",
            "请阅读",
            attachments=[{"id": "att_1", "type": "file", "name": "a.txt"}],
            selection="选中的文字",
        )
        self.assertEqual(message["attachments"][0]["id"], "att_1")
        self.assertEqual(message["selection"], "选中的文字")

    def test_attachment_message_survives_session_roundtrip_without_file_text(self) -> None:
        with TemporaryDirectory() as temp_dir:
            projects_dir = Path(temp_dir) / "projects"
            with patch.object(project_store, "PROJECTS_DIR", projects_dir):
                project = project_store.create_project(name="附件回显测试")
                session = session_store.create_session(project["meta"]["id"])
                attachment = {
                    "id": "att_roundtrip",
                    "type": "file",
                    "name": "设定.txt",
                    "mime": "text/plain",
                    "size": 128,
                    "status": "ready",
                    "parsed": {
                        "kind": "txt",
                        "text_truncated": True,
                        "chars": 9000,
                    },
                }
                message = session_store.make_message(
                    "user",
                    "请阅读附件",
                    attachments=[attachment],
                    selection="旧城区",
                )
                session_store.append_messages(
                    project["meta"]["id"],
                    session["id"],
                    [message],
                )

                loaded = session_store.get_session(project["meta"]["id"], session["id"])
                loaded_message = loaded["messages"][0]
                self.assertEqual(loaded_message["attachments"], [attachment])
                self.assertEqual(loaded_message["selection"], "旧城区")
                self.assertNotIn("text", loaded_message["attachments"][0]["parsed"])

                raw = session_store._session_path(
                    project["meta"]["id"], session["id"]
                ).read_text(encoding="utf-8")
                self.assertNotIn("人物住在旧城区", raw)


if __name__ == "__main__":
    unittest.main()
