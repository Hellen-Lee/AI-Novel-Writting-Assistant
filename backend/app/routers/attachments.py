"""Agent 附件 API：上传（A2）/ 读取（A3）/ 孤儿删除（A4）。

契约见 docs/changes/260913 待办清单。上传流程：
校验（H1-H3）→ 流式落盘 → 解析（C1 图片缩略图 / D1-D2 txt/md 文本提取，
docx/pdf/csv/json 解析器待 D3-D5 接入）→ 生成 AttachmentRecord + sidecar。
"""

from __future__ import annotations

import mimetypes
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.models.schemas import (
    AttachmentFileParsed,
    AttachmentImageParsed,
    AttachmentRecord,
    AttachmentUploadResponse,
)
from app.services import (
    attachment_parser,
    attachment_store,
    project_store,
    session_store,
)

router = APIRouter()


def _ensure_session(project_id: str, session_id: str) -> None:
    """项目不存在 404、会话不存在 404（与现有路由错误风格一致）。"""
    session_store.get_session(project_id, session_id)


def _failed_record(att_id: str, name: str, att_type: str, error: str) -> dict[str, Any]:
    return AttachmentRecord(
        id=att_id,
        type=att_type,  # type: ignore[arg-type]
        name=name,
        status="failed",
        error=error,
    ).model_dump()


def _load_record_or_404(
    project_id: str, session_id: str, att_id: str
) -> dict[str, Any]:
    record = attachment_store.read_record(project_id, session_id, att_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"附件不存在: {att_id}")
    return record


@router.post(
    "/projects/{project_id}/agent/attachments",
    response_model=AttachmentUploadResponse,
)
async def upload_attachments(
    project_id: str,
    session_id: str = Form(...),
    files: list[UploadFile] = File(...),
):
    """批量上传：multipart 表单（session_id + files[]），逐项返回结果。

    部分失败时 ready 与 failed 混合返回，互不影响（A2 验收）。
    """
    try:
        _ensure_session(project_id, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # H3 数量上限：整批拒绝（前端 B2 已预校验，正常不会触发）
    if not files:
        raise HTTPException(status_code=400, detail="未收到文件")
    if len(files) > attachment_store.MAX_ATTACHMENTS_PER_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"单条消息附件数超限（≤{attachment_store.MAX_ATTACHMENTS_PER_BATCH} 个）",
        )

    records: list[dict[str, Any]] = []
    for upload in files:
        name = upload.filename or "未命名"
        att_id = attachment_store.new_attachment_id()
        att_type, ext = attachment_store.classify(name)

        # H1 白名单（D7 话术）；解析器二道防线在 C/D 阶段接入
        if att_type is None:
            records.append(
                _failed_record(
                    att_id,
                    name,
                    "file",
                    attachment_store.UNSUPPORTED_HINT.format(ext=ext or "该"),
                )
            )
            continue

        try:
            size, rel = attachment_store.save_upload_stream(
                project_id,
                session_id,
                att_id,
                ext,
                upload.file,
                max_bytes=attachment_store.max_bytes_for(att_type),
            )
        except attachment_store.AttachmentTooLargeError:
            records.append(
                _failed_record(
                    att_id, name, att_type, attachment_store.size_limit_hint(att_type)
                )
            )
            continue
        except OSError:
            records.append(_failed_record(att_id, name, att_type, "文件保存失败，请重试"))
            continue

        # 解析（C1 图片缩略图 / D1-D2 文本提取）：异常 → failed + 中文原因；
        # 原文件保留在磁盘上（failed chip 由用户移除时经 A4 清理），sidecar 照写。
        mime = (
            upload.content_type
            or mimetypes.guess_type(name)[0]
            or "application/octet-stream"
        )
        status = "ready"
        error = ""
        parsed: Optional[AttachmentImageParsed | AttachmentFileParsed] = None
        abs_path = project_store.get_project_dir(project_id) / rel
        try:
            if att_type == "image":
                img = attachment_parser.parse_image_attachment(
                    abs_path,
                    attachment_store.thumb_path(project_id, session_id, att_id),
                )
                parsed = AttachmentImageParsed(
                    thumb_rel=attachment_store.thumb_rel(session_id, att_id),
                    width=img["width"],
                    height=img["height"],
                )
            else:
                # TODO(D3/D4/D5)：docx/pdf/csv/json 解析器接入后自动生效；
                # 未注册格式 parse_file_attachment 返回 None（ready + parsed=None）
                file_parsed = attachment_parser.parse_file_attachment(ext, abs_path)
                if file_parsed is not None:
                    parsed = AttachmentFileParsed(**file_parsed)
        except attachment_parser.ParseError as exc:
            status = "failed"
            error = str(exc)

        record = AttachmentRecord(
            id=att_id,
            type=att_type,  # type: ignore[arg-type]
            name=name,
            mime=mime,
            size=size,
            status=status,  # type: ignore[arg-type]
            error=error,
            storage_rel=rel,
            parsed=parsed,
        )
        attachment_store.write_record(project_id, session_id, record.model_dump())
        records.append(record.model_dump())

    ready = sum(1 for r in records if r["status"] == "ready")
    return AttachmentUploadResponse(
        records=[AttachmentRecord(**r) for r in records],
        count=len(records),
        ready_count=ready,
        failed_count=len(records) - ready,
    )


@router.get("/projects/{project_id}/agent/attachments/{att_id}/thumb")
def get_attachment_thumb(
    project_id: str,
    att_id: str,
    session_id: str = Query(...),
):
    """缩略图（图片专用）：chip hover 与历史回显使用。

    骨架阶段 C1 未接入、缩略图不存在时回退返回原图。
    """
    try:
        _ensure_session(project_id, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    record = _load_record_or_404(project_id, session_id, att_id)
    if record.get("type") != "image":
        raise HTTPException(status_code=404, detail="该附件无缩略图")

    thumb = attachment_store.thumb_path(project_id, session_id, att_id)
    if thumb.exists():
        return FileResponse(thumb, media_type="image/jpeg")

    original = attachment_store.original_path(project_id, session_id, record)
    if original is None:
        raise HTTPException(status_code=404, detail="附件文件缺失")
    return FileResponse(
        original, media_type=record.get("mime") or "application/octet-stream"
    )


@router.get("/projects/{project_id}/agent/attachments/{att_id}")
def get_attachment_original(
    project_id: str,
    att_id: str,
    session_id: str = Query(...),
):
    """原图 / 原文件（点击查看大图或下载用）。"""
    try:
        _ensure_session(project_id, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    record = _load_record_or_404(project_id, session_id, att_id)

    original = attachment_store.original_path(project_id, session_id, record)
    if original is None:
        raise HTTPException(status_code=404, detail="附件文件缺失")
    return FileResponse(
        original,
        media_type=record.get("mime") or "application/octet-stream",
        filename=record.get("name") or None,
    )


@router.delete(
    "/projects/{project_id}/agent/attachments/{att_id}",
    status_code=204,
)
def delete_attachment(
    project_id: str,
    att_id: str,
    session_id: str = Query(...),
):
    """孤儿附件删除（A4）：仅允许删除未被任何已持久化消息引用的附件。"""
    try:
        _ensure_session(project_id, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _load_record_or_404(project_id, session_id, att_id)

    if attachment_store.is_referenced(project_id, session_id, att_id):
        raise HTTPException(status_code=409, detail="附件已随消息发送，无法删除")

    attachment_store.delete_attachment_files(project_id, session_id, att_id)
