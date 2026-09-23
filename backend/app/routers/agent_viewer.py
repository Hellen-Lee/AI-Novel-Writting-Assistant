"""Developer-only Agent Viewer APIs (read run ledgers for observation)."""

from fastapi import APIRouter, HTTPException, Request

from app.models.schemas import RunListItem, RunListResponse
from app.services import reasoning_store, run_store

router = APIRouter()


def _require_local_request(request: Request) -> None:
    """Run ledgers contain prompts and model reasoning; keep them local-only."""
    host = request.client.host if request.client else ""
    if host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=403, detail="Agent Viewer 仅允许本机访问")


@router.get(
    "/dev/projects/{project_id}/agent/runs",
    response_model=RunListResponse,
)
def list_agent_runs(request: Request, project_id: str):
    _require_local_request(request)
    try:
        items = run_store.list_runs(project_id)
        return RunListResponse(
            runs=[RunListItem(**item) for item in items],
            count=len(items),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dev/projects/{project_id}/agent/runs/{run_id}")
def get_agent_run(request: Request, project_id: str, run_id: str):
    _require_local_request(request)
    try:
        return run_store.get_run(project_id, run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/dev/projects/{project_id}/agent/runs/{run_id}/steps/{step_index}/reasoning"
)
def get_agent_step_reasoning(
    request: Request,
    project_id: str,
    run_id: str,
    step_index: int,
):
    _require_local_request(request)
    try:
        run = run_store.get_run(project_id, run_id)
        steps = run.get("steps") or []
        if step_index < 0 or step_index >= len(steps):
            raise FileNotFoundError(f"步骤不存在: {step_index}")
        step = steps[step_index]
        reference = step.get("reasoning_ref") if isinstance(step, dict) else None
        if not isinstance(reference, dict):
            raise FileNotFoundError(f"思考记录不存在: {step_index}")
        return reasoning_store.read_reasoning(
            project_id,
            run_id,
            step_index,
            reference=reference,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dev/projects/{project_id}/agent/sessions/{session_id}/runs")
def list_session_agent_runs(request: Request, project_id: str, session_id: str):
    _require_local_request(request)
    try:
        runs = run_store.list_runs_for_session(project_id, session_id)
        return {"session_id": session_id, "runs": runs, "count": len(runs)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
