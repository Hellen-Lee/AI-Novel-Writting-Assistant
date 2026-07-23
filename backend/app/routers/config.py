"""Model config API routes."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.config import get_public_config, update_config
from app.models.schemas import (
    ConfigModelsResponse,
    ConfigProbeRequest,
    ConfigResponse,
    ConfigTestResponse,
    ConfigUpdateRequest,
    ModelInfo,
)
from app.services.model_client import ModelClientError, build_client

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


@router.post("/config/test", response_model=ConfigTestResponse)
def test_config(payload: Optional[ConfigProbeRequest] = None):
    """Test model API connectivity. Body may override unsaved form values."""
    overrides = payload.model_dump(exclude_unset=True) if payload else None
    client = build_client(overrides)
    try:
        result = client.test_connection()
    except ModelClientError as exc:
        status = 400 if exc.status_code in (None, 400) else 502
        if exc.status_code in (401, 403):
            status = 401
        raise HTTPException(status_code=status, detail=exc.message) from exc
    return result


@router.get("/config/models", response_model=ConfigModelsResponse)
def list_models_saved():
    """List available models using the saved local config."""
    return _list_models(None)


@router.post("/config/models", response_model=ConfigModelsResponse)
def list_models_probe(payload: Optional[ConfigProbeRequest] = None):
    """List available models; body may override unsaved form values for selection."""
    overrides = payload.model_dump(exclude_unset=True) if payload else None
    return _list_models(overrides)


def _list_models(overrides: Optional[dict[str, Any]]) -> ConfigModelsResponse:
    client = build_client(overrides)
    try:
        models = client.list_models()
    except ModelClientError as exc:
        status = 400 if exc.status_code in (None, 400) else 502
        if exc.status_code in (401, 403):
            status = 401
        raise HTTPException(status_code=status, detail=exc.message) from exc

    selected = str(client.config.get("model") or "")
    return ConfigModelsResponse(
        models=[ModelInfo(**item) for item in models],
        selected=selected,
        count=len(models),
    )
