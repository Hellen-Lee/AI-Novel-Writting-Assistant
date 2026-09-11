"""Streaming generation API (HTTP SSE)."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models.schemas import GenerateRequest
from app.services import generation_service, session_store, skill_loader
from app.services.project_store import project_exists

router = APIRouter()


@router.post("/projects/{project_id}/generate")
def generate(project_id: str, payload: GenerateRequest):
    if not project_exists(project_id):
        raise HTTPException(status_code=404, detail=f"项目不存在: {project_id}")

    skill_name = (payload.skill_name or "").strip() or None
    if skill_name is not None and skill_loader.get_skill(skill_name) is None:
        raise HTTPException(
            status_code=404,
            detail=f"Skill not found: {skill_name}",
        )

    try:
        session_store.get_session(project_id, payload.session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return StreamingResponse(
        generation_service.iter_generate(
            project_id,
            session_id=payload.session_id,
            skill_name=skill_name,
            chapter_id=payload.chapter_id,
            current_content=payload.current_content,
            selected_text=payload.selected_text,
            user_input=payload.user_input,
            chapter_rules=payload.chapter_rules,
            model=payload.model,
            content_anchor=payload.content_anchor,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
