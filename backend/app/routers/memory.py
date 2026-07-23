"""Project memory (settings library) API routes."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    MemoryEntry,
    MemoryEntryCreateRequest,
    MemoryEntryUpdateRequest,
    ProjectMemory,
)
from app.services import memory_store
from app.services.memory_store import MEMORY_CATEGORIES

router = APIRouter()


@router.get("/projects/{project_id}/memory", response_model=ProjectMemory)
def get_memory(project_id: str):
    try:
        return memory_store.load_memory(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/projects/{project_id}/memory", response_model=ProjectMemory)
def put_memory(project_id: str, payload: ProjectMemory):
    try:
        return memory_store.replace_memory(project_id, payload.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/projects/{project_id}/memory/{category}",
    response_model=MemoryEntry,
)
def create_memory_entry(
    project_id: str,
    category: str,
    payload: MemoryEntryCreateRequest,
):
    if category not in MEMORY_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"不支持的记忆分类: {category}")
    try:
        return memory_store.add_memory_entry(
            project_id,
            category,
            payload.model_dump(),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put(
    "/projects/{project_id}/memory/{category}/{entry_id}",
    response_model=MemoryEntry,
)
def update_memory_entry(
    project_id: str,
    category: str,
    entry_id: str,
    payload: MemoryEntryUpdateRequest,
):
    if category not in MEMORY_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"不支持的记忆分类: {category}")
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="请求体不能为空")
    try:
        return memory_store.update_memory_entry(
            project_id,
            category,
            entry_id,
            data,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/projects/{project_id}/memory/{category}/{entry_id}")
def delete_memory_entry(project_id: str, category: str, entry_id: str):
    if category not in MEMORY_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"不支持的记忆分类: {category}")
    try:
        memory_store.delete_memory_entry(project_id, category, entry_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "category": category, "id": entry_id}
