"""Agent chat session CRUD API routes."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    SessionClearResponse,
    SessionCreateRequest,
    SessionDetail,
    SessionListResponse,
    SessionSummary,
    SessionUpdateRequest,
)
from app.services import session_store

router = APIRouter()


@router.get(
    "/projects/{project_id}/agent/sessions",
    response_model=SessionListResponse,
)
def list_sessions(project_id: str):
    try:
        items = session_store.list_sessions(project_id)
        return SessionListResponse(
            sessions=[SessionSummary(**item) for item in items],
            count=len(items),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/projects/{project_id}/agent/sessions",
    response_model=SessionDetail,
)
def create_session(project_id: str, payload: SessionCreateRequest):
    try:
        session = session_store.create_session(project_id, title=payload.title)
        return SessionDetail(**session)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/projects/{project_id}/agent/sessions/{session_id}",
    response_model=SessionDetail,
)
def get_session(project_id: str, session_id: str):
    try:
        return SessionDetail(**session_store.get_session(project_id, session_id))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete(
    "/projects/{project_id}/agent/sessions",
    response_model=SessionClearResponse,
)
def clear_sessions(project_id: str):
    """清空项目下全部会话（连同附件与 run 账本）。"""
    try:
        deleted = session_store.clear_sessions(project_id)
        return SessionClearResponse(deleted=deleted)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete(
    "/projects/{project_id}/agent/sessions/{session_id}",
    status_code=204,
)
def delete_session(project_id: str, session_id: str):
    try:
        session_store.delete_session(project_id, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put(
    "/projects/{project_id}/agent/sessions/{session_id}",
    response_model=SessionSummary,
)
def update_session(project_id: str, session_id: str, payload: SessionUpdateRequest):
    """重命名只影响标题，返回索引摘要即可，避免传输整份会话消息正文。"""
    try:
        session = session_store.rename_session(project_id, session_id, payload.title)
        return SessionSummary(**session_store.summarize_session(session))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
