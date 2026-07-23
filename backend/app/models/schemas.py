"""Pydantic schemas for API request/response."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from app.config import AppConfig


class HealthResponse(BaseModel):
    status: str
    message: str


class ConfigUpdateRequest(BaseModel):
    api_base: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = Field(default=None, ge=0, le=2)
    top_p: Optional[float] = Field(default=None, ge=0, le=1)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=128000)


class ConfigResponse(AppConfig):
    api_key_configured: bool = False


class ConfigProbeRequest(BaseModel):
    """Optional overrides for test/list before saving config."""

    api_base: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None


class ConfigTestResponse(BaseModel):
    ok: bool
    message: str
    model: str = ""
    models_count: Optional[int] = None
    models: list[str] = Field(default_factory=list)
    preview: Optional[str] = None


class ModelInfo(BaseModel):
    id: str
    owned_by: str = ""
    created: Optional[int] = None


class ConfigModelsResponse(BaseModel):
    models: list[ModelInfo] = Field(default_factory=list)
    selected: str = ""
    count: int = 0


class OutlineChapter(BaseModel):
    id: str
    title: str
    order: int
    filename: str


class ProjectMeta(BaseModel):
    id: str
    name: str
    genre: str = ""
    description: str = ""
    created_at: str
    updated_at: str
    total_words: int = 0


class ProjectSettings(BaseModel):
    global_rules: str = ""
    style_preference: str = ""


class ProjectOutline(BaseModel):
    synopsis: str = ""
    chapters: list[OutlineChapter] = Field(default_factory=list)


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    genre: str = ""
    description: str = ""
    global_rules: str = ""
    style_preference: str = ""
    synopsis: str = ""
    first_chapter_title: str = "第一章"


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    genre: Optional[str] = None
    description: Optional[str] = None
    global_rules: Optional[str] = None
    style_preference: Optional[str] = None
    synopsis: Optional[str] = None


class ProjectSummary(BaseModel):
    id: str
    name: str
    genre: str = ""
    description: str = ""
    created_at: str
    updated_at: str
    total_words: int = 0
    chapter_count: int = 0


class ProjectDetail(BaseModel):
    meta: ProjectMeta
    settings: ProjectSettings
    outline: ProjectOutline


class ChapterCreateRequest(BaseModel):
    """POST /chapters: 无 id 新建；有 id 则更新标题/正文。"""

    id: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=1)
    content: Optional[str] = None


class ChapterUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    content: Optional[str] = None


class ChapterSummary(BaseModel):
    id: str
    title: str
    order: int
    filename: str
    word_count: int = 0


class ChapterDetail(BaseModel):
    id: str
    title: str
    order: int
    filename: str
    content: str
    word_count: int = 0


class MemoryEntry(BaseModel):
    id: str = ""
    name: str = Field(min_length=1)
    content: str = ""
    tags: list[str] = Field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""


class ProjectMemory(BaseModel):
    worldview: list[MemoryEntry] = Field(default_factory=list)
    characters: list[MemoryEntry] = Field(default_factory=list)
    items: list[MemoryEntry] = Field(default_factory=list)
    plot_points: list[MemoryEntry] = Field(default_factory=list)
    relationships: list[MemoryEntry] = Field(default_factory=list)


class MemoryEntryCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    content: str = ""
    tags: list[str] = Field(default_factory=list)


class MemoryEntryUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    content: Optional[str] = None
    tags: Optional[list[str]] = None


class SkillSummary(BaseModel):
    name: str
    description: str
    kind: str
    disable_model_invocation: bool = True
    source: str = "builtin"
    slash_command: str = ""


class SkillDetail(SkillSummary):
    system: str = ""
    user_template: str = ""
    path: str = ""


class SkillListResponse(BaseModel):
    skills: list[SkillSummary] = Field(default_factory=list)
    count: int = 0
    load_errors: list[str] = Field(default_factory=list)
