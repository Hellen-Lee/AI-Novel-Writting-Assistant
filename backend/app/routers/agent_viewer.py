"""Developer-only Agent Viewer APIs (read run ledgers for observation)."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import RunListItem, RunListResponse
from app.services import run_store

router = APIRouter()


@router.get(
    "/dev/projects/{project_id}/agent/runs",
    response_model=RunListResponse,
)
def list_agent_runs(project_id: str):
    try:
        items = run_store.list_runs(project_id)
        return RunListResponse(
            runs=[RunListItem(**item) for item in items],
            count=len(items),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dev/projects/{project_id}/agent/runs/{run_id}")
def get_agent_run(project_id: str, run_id: str):
    try:
        return run_store.get_run(project_id, run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
