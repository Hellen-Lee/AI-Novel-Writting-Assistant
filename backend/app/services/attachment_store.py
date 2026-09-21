"""Agent 附件落盘与引用管理。

存储约定（契约见 docs/changes/260913 待办清单 A1/F2）：

    data/projects/{pid}/agent/attachments/{sid}/
        {att_id}.{ext}        原始文件（存储名一律 att_id，规避中文名编码问题，H6）
        {att_id}.meta.json    AttachmentRecord sidecar（解析阶段回填 parsed）
        {att_id}.thumb.jpg    缩略图（C1 阶段生成，骨架阶段不存在）

引用判定：扫描会话 JSON 中 messages[].attachments[].id（F2 准绳，
A4 孤儿删除与 G 级联清理均以此为准）。
"""

from __future__ import annotations

import json
import re
import shutil
import uuid
from pathlib import Path
from typing import Any, BinaryIO, Optional

from app.services import project_store, session_store

ATTACHMENT_ID_RE = re.compile(r"^att_[a-zA-Z0-9_]+$")

# --- H1 格式白名单（前端 B2 有同名常量，P0 阶段两边各自维护、保持同步；P1 改由后端下发） ---
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
FILE_EXTS = {".docx", ".pdf", ".txt", ".md", ".csv", ".json"}
UNSUPPORTED_HINT = "暂不支持 {ext} 格式，可改用 docx / pdf / txt / md"

# MIME 不能只看扩展名：浏览器/脚本可伪造文件名，因此后端同时校验声明的 MIME。
# 同一格式允许少量常见别名，避免不同浏览器对纯文本与 CSV 的声明差异造成误拒。
MIME_BY_EXT = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".gif": {"image/gif"},
    ".webp": {"image/webp"},
    ".bmp": {"image/bmp", "image/x-ms-bmp"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    },
    ".pdf": {"application/pdf"},
    ".txt": {"text/plain"},
    ".md": {"text/markdown", "text/plain"},
    ".csv": {"text/csv", "application/csv", "application/vnd.ms-excel"},
    ".json": {"application/json", "text/plain"},
}

# --- H2 单文件大小上限 ---
IMAGE_MAX_BYTES = 5 * 1024 * 1024
FILE_MAX_BYTES = 10 * 1024 * 1024

# --- H3 单条消息附件数上限 ---
MAX_ATTACHMENTS_PER_BATCH = 5

# 流式落盘分块大小
_CHUNK_BYTES = 64 * 1024


class AttachmentTooLargeError(ValueError):
    """流式写入累计字节超过上限时抛出（H2，不整读进内存）。"""


def new_attachment_id() -> str:
    return f"att_{uuid.uuid4().hex[:12]}"


def validate_attachment_id(att_id: str) -> None:
    if not ATTACHMENT_ID_RE.match(att_id or ""):
        raise FileNotFoundError(f"附件不存在: {att_id}")


def attachments_dir(project_id: str, session_id: str) -> Path:
    return project_store.get_project_dir(project_id) / "agent" / "attachments" / session_id


def classify(filename: str) -> tuple[Optional[str], str]:
    """按扩展名分类 → (type, ext)；不支持时 type 为 None（H1/D7）。"""
    ext = Path(filename or "").suffix.lower()
    if ext in IMAGE_EXTS:
        return "image", ext
    if ext in FILE_EXTS:
        return "file", ext
    return None, ext


def is_allowed_mime(ext: str, mime: str) -> bool:
    """校验 MIME 是否与已允许的扩展名匹配。"""
    normalized = (mime or "").split(";", 1)[0].strip().lower()
    return normalized in MIME_BY_EXT.get(ext.lower(), set())


def max_bytes_for(att_type: str) -> int:
    return IMAGE_MAX_BYTES if att_type == "image" else FILE_MAX_BYTES


def size_limit_hint(att_type: str) -> str:
    if att_type == "image":
        return f"图片超过大小限制（≤{IMAGE_MAX_BYTES // 1024 // 1024}MB）"
    return f"文件超过大小限制（≤{FILE_MAX_BYTES // 1024 // 1024}MB）"


def storage_rel(session_id: str, att_id: str, ext: str) -> str:
    """相对项目目录的存储路径（写入 AttachmentRecord.storage_rel）。"""
    return f"agent/attachments/{session_id}/{att_id}{ext}"


def thumb_rel(session_id: str, att_id: str) -> str:
    """缩略图相对项目目录路径（写入 AttachmentImageParsed.thumb_rel）。"""
    return f"agent/attachments/{session_id}/{att_id}.thumb.jpg"


def _abs_path(project_id: str, rel: str) -> Path:
    return project_store.get_project_dir(project_id) / rel


def sidecar_path(project_id: str, session_id: str, att_id: str) -> Path:
    # 命名避开 {att_id}.json：用户上传 .json 文件时原文件即占用该名
    return attachments_dir(project_id, session_id) / f"{att_id}.meta.json"


def thumb_path(project_id: str, session_id: str, att_id: str) -> Path:
    return attachments_dir(project_id, session_id) / f"{att_id}.thumb.jpg"


def save_upload_stream(
    project_id: str,
    session_id: str,
    att_id: str,
    ext: str,
    stream: BinaryIO,
    *,
    max_bytes: int,
) -> tuple[int, str]:
    """流式落盘原始文件 → (size, storage_rel)。超限即中断并清理半成品（H2）。"""
    rel = storage_rel(session_id, att_id, ext)
    path = _abs_path(project_id, rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with path.open("wb") as out:
            while True:
                chunk = stream.read(_CHUNK_BYTES)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise AttachmentTooLargeError
                out.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return size, rel


def write_record(project_id: str, session_id: str, record: dict[str, Any]) -> None:
    path = sidecar_path(project_id, session_id, att_id=record["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)


def read_record(
    project_id: str, session_id: str, att_id: str
) -> Optional[dict[str, Any]]:
    validate_attachment_id(att_id)
    path = sidecar_path(project_id, session_id, att_id)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else None


def original_path(
    project_id: str, session_id: str, record: dict[str, Any]
) -> Optional[Path]:
    """由 record.storage_rel 还原原文件绝对路径；文件缺失返回 None。"""
    rel = str(record.get("storage_rel") or "")
    if not rel:
        return None
    path = _abs_path(project_id, rel)
    return path if path.exists() else None


def delete_attachment_files(project_id: str, session_id: str, att_id: str) -> None:
    """删除原文件 + 缩略图 + sidecar（A4/G 共用）；不存在的静默跳过。"""
    validate_attachment_id(att_id)
    base = attachments_dir(project_id, session_id)
    if not base.exists():
        return
    for path in base.glob(f"{att_id}.*"):
        if path.is_file():
            path.unlink(missing_ok=True)
    # 目录空则顺手移除
    try:
        if not any(base.iterdir()):
            base.rmdir()
    except OSError:
        pass


def delete_session_attachments(project_id: str, session_id: str) -> None:
    """删除会话的全部附件及解析产物（G1/G2）。"""
    directory = attachments_dir(project_id, session_id)
    if directory.exists():
        shutil.rmtree(directory)


def is_referenced(project_id: str, session_id: str, att_id: str) -> bool:
    """附件是否已被会话中任何已持久化消息引用（F2 孤儿判定）。

    P0 简版：每次直接扫描会话 JSON（本地小文件，成本可忽略）；
    F2 阶段如需再加内存缓存（会话保存时失效）。
    """
    try:
        session = session_store.get_session(project_id, session_id)
    except FileNotFoundError:
        return False
    for msg in session.get("messages") or []:
        if not isinstance(msg, dict):
            continue
        for att in msg.get("attachments") or []:
            if isinstance(att, dict) and att.get("id") == att_id:
                return True
    return False
