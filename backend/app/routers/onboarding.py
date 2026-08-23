"""引导页 AI 一键生成设定（无状态，普通 JSON 响应）。"""

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    OnboardingGenerateRequest,
    OnboardingGenerateResponse,
)
from app.services import onboarding_service
from app.services.model_client import ModelClientError

router = APIRouter()


@router.post("/onboarding/generate", response_model=OnboardingGenerateResponse)
def onboarding_generate(payload: OnboardingGenerateRequest):
    try:
        data = onboarding_service.generate_onboarding_settings(
            topic=payload.topic,
            genre=payload.genre,
            worldview=payload.worldview,
            story_core=payload.story_core,
            characters=payload.characters,
            synopsis=payload.synopsis,
            volumes=payload.volumes,
            section=payload.section,
            model=payload.model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModelClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return OnboardingGenerateResponse.model_validate(data)
