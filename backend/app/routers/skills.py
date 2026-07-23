"""Skill listing and detail API."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import SkillDetail, SkillListResponse, SkillSummary
from app.services import skill_loader
from app.services.skill_loader import VALID_KINDS

router = APIRouter()


@router.get("/skills", response_model=SkillListResponse)
def list_skills(
    kind: Optional[str] = Query(default=None, description="quick_action | skill"),
):
    if kind is not None and kind not in VALID_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"kind 必须是 {sorted(VALID_KINDS)} 之一",
        )
    items = skill_loader.list_skills(kind=kind)
    return SkillListResponse(
        skills=[SkillSummary(**item) for item in items],
        count=len(items),
        load_errors=skill_loader.get_load_errors(),
    )


@router.get("/skills/{name}", response_model=SkillDetail)
def get_skill_detail(name: str):
    detail = skill_loader.get_skill_detail(name)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")
    return SkillDetail(**detail)
