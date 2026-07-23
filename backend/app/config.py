"""Local app config: read/write data/config.json with validation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CONFIG_PATH = DATA_DIR / "config.json"
PROJECTS_DIR = DATA_DIR / "projects"


class AppConfig(BaseModel):
    api_base: str = "https://api.openai.com/v1"
    api_key: str = ""
    model: str = "gpt-4o-mini"
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float = Field(default=0.9, ge=0, le=1)
    max_tokens: int = Field(default=2048, ge=1, le=128000)

    @field_validator("api_base")
    @classmethod
    def validate_api_base(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("api_base 不能为空")
        if not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("api_base 必须以 http:// 或 https:// 开头")
        return value.rstrip("/")

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("model 不能为空")
        return value


DEFAULT_CONFIG = AppConfig().model_dump()


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


def mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:4]}****{api_key[-4:]}"


def is_masked_api_key(api_key: str) -> bool:
    return "****" in api_key or (bool(api_key) and set(api_key) == {"*"})


def load_config() -> dict[str, Any]:
    ensure_data_dir()
    if not CONFIG_PATH.exists():
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG.copy()

    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)

    merged = DEFAULT_CONFIG.copy()
    merged.update(data or {})
    return AppConfig.model_validate(merged).model_dump()


def save_config(config: dict[str, Any]) -> dict[str, Any]:
    ensure_data_dir()
    validated = AppConfig.model_validate(config).model_dump()
    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(validated, f, ensure_ascii=False, indent=2)
    return validated


def get_public_config() -> dict[str, Any]:
    config = load_config()
    return {
        **config,
        "api_key": mask_api_key(config.get("api_key", "")),
        "api_key_configured": bool(config.get("api_key")),
    }


def update_config(payload: dict[str, Any]) -> dict[str, Any]:
    current = load_config()
    incoming = dict(payload)
    incoming_key = incoming.get("api_key")

    if incoming_key is None:
        incoming["api_key"] = current.get("api_key", "")
    elif is_masked_api_key(str(incoming_key)) or str(incoming_key) == mask_api_key(
        current.get("api_key", "")
    ):
        incoming["api_key"] = current.get("api_key", "")

    merged = {**current, **incoming}
    return save_config(merged)
