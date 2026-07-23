"""Model config API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.config import get_public_config, update_config
from app.models.schemas import ConfigResponse, ConfigUpdateRequest

router = APIRouter()


@router.get("/config", response_model=ConfigResponse)
def read_config():
    return get_public_config()


@router.post("/config", response_model=ConfigResponse)
def write_config(payload: ConfigUpdateRequest):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="请求体不能为空")
    try:
        update_config(data)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors()) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return get_public_config()
