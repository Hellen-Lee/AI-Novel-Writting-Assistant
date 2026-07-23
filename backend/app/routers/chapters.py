"""Chapter CRUD API routes."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ChapterCreateRequest,
    ChapterDetail,
    ChapterSummary,
    ChapterUpdateRequest,
)
from app.services import project_store

router = APIRouter()


@router.get("/projects/{project_id}/chapters", response_model=list[ChapterSummary])
def list_chapters(project_id: str):
    try:
        return project_store.list_chapters(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/projects/{project_id}/chapters", response_model=ChapterDetail)
def upsert_chapter(project_id: str, payload: ChapterCreateRequest):
    try:
        if payload.id:
            return project_store.update_chapter(
                project_id,
                payload.id,
                title=payload.title,
                content=payload.content,
            )
        return project_store.create_chapter(
            project_id,
            title=payload.title or "未命名章节",
            content=payload.content or "",
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}",
    response_model=ChapterDetail,
)
def get_chapter(project_id: str, chapter_id: str):
    try:
        return project_store.get_chapter(project_id, chapter_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put(
    "/projects/{project_id}/chapters/{chapter_id}",
    response_model=ChapterDetail,
)
def update_chapter(project_id: str, chapter_id: str, payload: ChapterUpdateRequest):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="请求体不能为空")
    try:
        return project_store.update_chapter(
            project_id,
            chapter_id,
            title=data.get("title"),
            content=data.get("content"),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
