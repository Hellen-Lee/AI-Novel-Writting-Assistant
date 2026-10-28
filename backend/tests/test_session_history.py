"""历史会话归档相关落盘能力：重命名 / 清空 / 自动标题锁定。

运行：python backend/tests/test_session_history.py
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import attachment_store, project_store, run_store, session_store


class SessionHistoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="ainovel_history_")
        self.projects_dir = Path(self.temp_dir.name) / "projects"
        self.patch = patch.object(project_store, "PROJECTS_DIR", self.projects_dir)
        self.patch.start()
        self.project_id = project_store.create_project(name="历史会话测试")["meta"]["id"]

    def tearDown(self) -> None:
        self.patch.stop()
        self.temp_dir.cleanup()

    def test_rename_persists_and_keeps_updated_at(self) -> None:
        session = session_store.create_session(self.project_id, "原会话")
        before = session_store.get_session(self.project_id, session["id"])
        # 直接落盘一个旧时间戳，验证重命名不会把它刷新成当前时间
        before["updated_at"] = 1_600_000_000_000
        session_store._write_json(
            session_store._session_path(self.project_id, session["id"]), before
        )

        renamed = session_store.rename_session(
            self.project_id, session["id"], "  青灯人出场续写  "
        )

        self.assertEqual(renamed["title"], "青灯人出场续写")
        self.assertTrue(renamed["title_locked"])
        self.assertEqual(renamed["updated_at"], 1_600_000_000_000)

        index = session_store.list_sessions(self.project_id)
        self.assertEqual(index[0]["title"], "青灯人出场续写")

    def test_rename_keeps_list_order(self) -> None:
        first = session_store.create_session(self.project_id, "较早会话")
        second = session_store.create_session(self.project_id, "较新会话")

        before = [s["id"] for s in session_store.list_sessions(self.project_id)]
        session_store.rename_session(self.project_id, first["id"], "较早会话（改名）")
        after = [s["id"] for s in session_store.list_sessions(self.project_id)]

        self.assertEqual(before, after)
        self.assertEqual(after, [second["id"], first["id"]])

    def test_rename_truncates_and_rejects_blank(self) -> None:
        session = session_store.create_session(self.project_id)

        renamed = session_store.rename_session(
            self.project_id, session["id"], "标" * 100
        )
        self.assertEqual(len(renamed["title"]), 64)

        with self.assertRaises(ValueError):
            session_store.rename_session(self.project_id, session["id"], "   ")

        with self.assertRaises(FileNotFoundError):
            session_store.rename_session(self.project_id, "sess_nope", "标题")

    def test_rename_locks_title_against_first_message_autoname(self) -> None:
        session = session_store.create_session(self.project_id, "对话 1")
        session_store.rename_session(self.project_id, session["id"], "我的命名")

        session_store.append_messages(
            self.project_id,
            session["id"],
            [session_store.make_message("user", "帮我续写一段")],
            title_if_empty="帮我续写一段",
        )

        loaded = session_store.get_session(self.project_id, session["id"])
        self.assertEqual(loaded["title"], "我的命名")

    def test_append_messages_still_autonames_unlocked_session(self) -> None:
        session = session_store.create_session(self.project_id, "对话 2")

        session_store.append_messages(
            self.project_id,
            session["id"],
            [session_store.make_message("user", "润色一下这一段")],
            title_if_empty="润色一下这一段",
        )

        loaded = session_store.get_session(self.project_id, session["id"])
        self.assertEqual(loaded["title"], "润色一下这一段")

    def test_clear_sessions_removes_files_attachments_and_runs(self) -> None:
        first = session_store.create_session(self.project_id, "会话 A")
        second = session_store.create_session(self.project_id, "会话 B")

        attachment_dir = attachment_store.attachments_dir(self.project_id, first["id"])
        attachment_dir.mkdir(parents=True)
        (attachment_dir / "att_test.txt").write_text("内容", encoding="utf-8")

        runs_dir = project_store.get_project_dir(self.project_id) / "agent" / "runs"
        runs_dir.mkdir(parents=True)
        (runs_dir / "run_1.json").write_text(
            '{"run_id": "run_1", "session_id": "%s"}' % first["id"], encoding="utf-8"
        )

        deleted = session_store.clear_sessions(self.project_id)

        self.assertEqual(deleted, 2)
        self.assertEqual(session_store.list_sessions(self.project_id), [])
        self.assertFalse(attachment_dir.exists())
        self.assertFalse((runs_dir / "run_1.json").exists())
        for session in (first, second):
            with self.assertRaises(FileNotFoundError):
                session_store.get_session(self.project_id, session["id"])

    def test_clear_sessions_keeps_project_and_recreates_on_demand(self) -> None:
        session_store.create_session(self.project_id, "唯一会话")

        session_store.clear_sessions(self.project_id)
        ensured = session_store.ensure_default_session(self.project_id)

        self.assertTrue(ensured["id"].startswith("sess_"))
        self.assertEqual(len(session_store.list_sessions(self.project_id)), 1)

    def test_clear_sessions_purges_orphan_assets(self) -> None:
        """会话索引/文件都已缺失时，附件与 run 目录仍需整批回收。"""
        attachment_dir = attachment_store.attachments_dir(
            self.project_id, "sess_orphan"
        )
        attachment_dir.mkdir(parents=True)
        (attachment_dir / "att_orphan.txt").write_text("内容", encoding="utf-8")

        runs_dir = project_store.get_project_dir(self.project_id) / "agent" / "runs"
        runs_dir.mkdir(parents=True, exist_ok=True)
        (runs_dir / "run_orphan.json").write_text(
            '{"run_id": "run_orphan", "session_id": "sess_orphan"}', encoding="utf-8"
        )

        self.assertEqual(session_store.clear_sessions(self.project_id), 0)
        self.assertFalse(attachment_dir.exists())
        self.assertFalse((runs_dir / "run_orphan.json").exists())

    def test_clear_sessions_counts_orphan_session_files(self) -> None:
        """索引缺失但会话文件残留时也要删除并计入条数。"""
        sessions_dir = project_store.get_project_dir(self.project_id) / "agent" / "sessions"
        sessions_dir.mkdir(parents=True, exist_ok=True)
        (sessions_dir / "sess_ghost.json").write_text(
            '{"id": "sess_ghost", "messages": []}', encoding="utf-8"
        )

        self.assertEqual(session_store.clear_sessions(self.project_id), 1)
        self.assertFalse((sessions_dir / "sess_ghost.json").exists())

    def test_rename_session_summary_excludes_messages(self) -> None:
        """重命名接口返回索引摘要，不应带出消息正文。"""
        session = session_store.create_session(self.project_id, "原会话")
        session_store.append_messages(
            self.project_id,
            session["id"],
            [session_store.make_message("user", "很长的正文内容")],
        )

        renamed = session_store.rename_session(self.project_id, session["id"], "新标题")
        summary = session_store.summarize_session(renamed)

        self.assertNotIn("messages", summary)
        self.assertEqual(summary["title"], "新标题")
        self.assertEqual(summary["message_count"], 1)

    def test_clear_sessions_requires_existing_project(self) -> None:
        with self.assertRaises(FileNotFoundError):
            session_store.clear_sessions("not-exist-xxx")

    def test_delete_session_cascades_assets(self) -> None:
        session = session_store.create_session(self.project_id)
        attachment_dir = attachment_store.attachments_dir(self.project_id, session["id"])
        attachment_dir.mkdir(parents=True)
        run_path = run_store._run_path(self.project_id, "run_del")
        run_path.parent.mkdir(parents=True, exist_ok=True)
        run_path.write_text(
            '{"run_id": "run_del", "session_id": "%s"}' % session["id"],
            encoding="utf-8",
        )

        session_store.delete_session(self.project_id, session["id"])

        self.assertFalse(attachment_dir.exists())
        self.assertFalse(run_path.exists())
        with self.assertRaises(FileNotFoundError):
            session_store.get_session(self.project_id, session["id"])


if __name__ == "__main__":
    unittest.main()
