"""Skill listing, detail, create/update and delete API."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import (
    SkillDeleteResponse,
    SkillDetail,
    SkillListResponse,
    SkillSummary,
    SkillUpsertRequest,
)
from app.services import skill_loader
from app.services.skill_loader import VALID_KINDS, SkillValidationError

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


@router.put("/skills/{name}", response_model=SkillDetail)
def upsert_skill(name: str, body: SkillUpsertRequest):
    """Create or update a custom skill (writes under data/skills/)."""
    try:
        detail = skill_loader.upsert_custom_skill(
            path_name=name,
            name=body.name.strip(),
            description=body.description.strip(),
            kind=body.kind.strip(),
            disable_model_invocation=body.disable_model_invocation,
            system=body.system or "",
            user_template=body.user_template,
        )
    except SkillValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"写入技能失败: {exc}") from exc
    return SkillDetail(**detail)


@router.delete("/skills/{name}", response_model=SkillDeleteResponse)
def delete_skill(name: str):
    """Delete a custom skill. Builtin skills cannot be deleted."""
    try:
        result = skill_loader.delete_custom_skill(name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"删除技能失败: {exc}") from exc

    restored = result.get("skill")
    return SkillDeleteResponse(
        deleted=result["deleted"],
        restored_builtin=bool(result.get("restored_builtin")),
        skill=SkillDetail(**restored) if restored else None,
    )
