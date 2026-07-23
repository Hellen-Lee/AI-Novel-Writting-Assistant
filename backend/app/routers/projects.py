"""Project CRUD API routes."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ProjectCreateRequest,
    ProjectDetail,
    ProjectSummary,
    ProjectUpdateRequest,
)
from app.services import project_store

router = APIRouter()


@router.get("/projects", response_model=list[ProjectSummary])
def list_projects():
    return project_store.list_projects()


@router.post("/projects", response_model=ProjectDetail)
def create_project(payload: ProjectCreateRequest):
    try:
        return project_store.create_project(
            name=payload.name,
            genre=payload.genre,
            description=payload.description,
            global_rules=payload.global_rules,
            style_preference=payload.style_preference,
            synopsis=payload.synopsis,
            first_chapter_title=payload.first_chapter_title,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/projects/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str):
    try:
        return project_store.get_project_detail(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/projects/{project_id}", response_model=ProjectDetail)
def update_project(project_id: str, payload: ProjectUpdateRequest):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="请求体不能为空")
    try:
        return project_store.update_project(project_id, data)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    try:
        project_store.delete_project(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "id": project_id}
