"""E1~E4 附件发送链路的离线单元检查。

运行：python backend/tests/test_attachment_send.py
"""

from __future__ import annotations

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.schemas import GenerateRequest
from app.services import prompt_builder, session_store


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


if __name__ == "__main__":
    unittest.main()
