"""Pydantic schemas for API request/response."""

from __future__ import annotations

import enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.config import AppConfig


def non_blank(field_name: str):
    """返回校验器：剔除首尾空白后必须非空。

    统一「空字符串」的语义：长度校验（min_length）无法拦截纯空白输入，
    会让 "   " 一路进入业务层再抛 400，与 Pydantic 的 422 不一致。
    统一在 schema 层拦截，保证所有接口返回一致的错误码。
    """

    def _validate(cls: Any, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError(f"{field_name} 不能为空或纯空白")
        return stripped

    return field_validator(field_name)(classmethod(_validate))


class HealthResponse(BaseModel):
    status: str
    message: str


class ConfigUpdateRequest(BaseModel):
    api_base: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    context_window: Optional[int] = None
    temperature: Optional[float] = Field(default=None, ge=0, le=2)
    top_p: Optional[float] = Field(default=None, ge=0, le=1)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=128000)
    reasoning_step_max_chars: Optional[int] = Field(default=None, ge=1_024, le=2_000_000)
    reasoning_run_max_chars: Optional[int] = Field(default=None, ge=1_024, le=8_000_000)
    reasoning_project_quota_bytes: Optional[int] = Field(
        default=None,
        ge=1 * 1024 * 1024,
        le=4 * 1024 * 1024 * 1024,
    )
    reasoning_retention_runs: Optional[int] = Field(default=None, ge=1, le=10_000)


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


class OutlineVolume(BaseModel):
    """卷纲条目（引导页「全本大纲」卡片）。"""

    id: str = ""
    label: str = ""
    name: str = ""
    summary: str = ""


class ProjectOutline(BaseModel):
    synopsis: str = ""
    volumes: list[OutlineVolume] = Field(default_factory=list)
    chapters: list[OutlineChapter] = Field(default_factory=list)


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    genre: str = ""
    description: str = ""
    global_rules: str = ""
    style_preference: str = ""
    synopsis: str = ""
    first_chapter_title: str = "第一章"

    _check_name = non_blank("name")


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    genre: Optional[str] = None
    description: Optional[str] = None
    global_rules: Optional[str] = None
    style_preference: Optional[str] = None
    synopsis: Optional[str] = None
    volumes: Optional[list[OutlineVolume]] = None


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

    _check_title = non_blank("title")


class ChapterUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    content: Optional[str] = None

    _check_title = non_blank("title")


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
    """Generic memory item for worldview / story_core."""

    id: str = ""
    name: str = Field(min_length=1)
    content: str = ""
    tags: list[str] = Field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""

    _check_name = non_blank("name")


class CharacterRelationship(BaseModel):
    type: str = Field(min_length=1)
    target: str = Field(min_length=1)


class CharacterEntry(BaseModel):
    """Character setting; relationships are nested (not a top-level category)."""

    id: str = ""
    name: str = Field(min_length=1)
    profile: str = ""
    relationship: list[CharacterRelationship] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""

    _check_name = non_blank("name")


class ProjectMemory(BaseModel):
    worldview: list[MemoryEntry] = Field(default_factory=list)
    characters: list[CharacterEntry] = Field(default_factory=list)
    story_core: list[MemoryEntry] = Field(default_factory=list)


class MemoryEntryCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    content: str = ""
    profile: str = ""
    relationship: list[CharacterRelationship] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)

    _check_name = non_blank("name")


class MemoryEntryUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    content: Optional[str] = None
    profile: Optional[str] = None
    relationship: Optional[list[CharacterRelationship]] = None
    tags: Optional[list[str]] = None

    _check_name = non_blank("name")


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


class SkillUpsertRequest(BaseModel):
    """Create / update a custom SKILL.md (frontmatter + body)."""

    name: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    kind: str
    disable_model_invocation: bool = True
    system: str = ""
    user_template: str = Field(..., min_length=1)

    _check_name = non_blank("name")
    _check_description = non_blank("description")
    _check_template = non_blank("user_template")


class SkillDeleteResponse(BaseModel):
    deleted: str
    restored_builtin: bool = False
    skill: Optional[SkillDetail] = None


class SkillListResponse(BaseModel):
    skills: list[SkillSummary] = Field(default_factory=list)
    count: int = 0
    load_errors: list[str] = Field(default_factory=list)


# --- Agent attachments（上传 → 解析 → 发送链路，契约见 docs/changes/260913 待办清单 A1） ---


class AttachmentImageParsed(BaseModel):
    """图片解析产物（C1 阶段填充：落盘缩略图 + 尺寸）。"""

    thumb_rel: str = ""
    width: int = 0
    height: int = 0


class AttachmentFileParsed(BaseModel):
    """文件解析产物（D 阶段填充：文本提取 + 截断标记）。"""

    kind: str = ""
    text: str = ""
    text_truncated: bool = False
    chars: int = 0
    # 扫描版 PDF 等场景提示（D4）
    note: str = ""


class AttachmentRecord(BaseModel):
    """附件统一契约（前后端对齐）。

    - id: ``att_`` + uuid12（与 sess_ / m_ 命名风格一致）
    - storage_rel: 相对项目目录的存储路径，形如 agent/attachments/{sid}/{att_id}.{ext}
    - parsed: 按 type 区分——图片 → AttachmentImageParsed，文件 → AttachmentFileParsed；
      A2 骨架阶段为 None，由 C/D 解析阶段填充
    """

    id: str
    type: Literal["image", "file"]
    name: str
    mime: str = ""
    size: int = 0
    status: Literal["ready", "failed"] = "ready"
    # 失败原因（中文，可直接展示）
    error: str = ""
    storage_rel: str = ""
    parsed: Optional[AttachmentImageParsed | AttachmentFileParsed] = None


class AttachmentUploadResponse(BaseModel):
    """批量上传逐项结果：ready 与 failed 可混合，部分失败不影响同批其他文件。"""

    records: list[AttachmentRecord] = Field(default_factory=list)
    count: int = 0
    ready_count: int = 0
    failed_count: int = 0


# --- Agent sessions & generation ---


class AgentMessage(BaseModel):
    id: str
    role: str
    content: str = ""
    skill: str = ""
    pending: bool = False
    error: str = ""
    created_at: str = ""
    # 本消息 AI 生成过程中调用过的工具（[{name, arguments(dict)}]，可空）
    tools: list[dict[str, Any]] = Field(default_factory=list)
    # user 消息携带的附件摘要；assistant 消息保持为空
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    # user 消息发送时的选中文本快照
    selection: str = ""


class SessionSummary(BaseModel):
    id: str
    title: str = "新对话"
    updated_at: int = 0
    message_count: int = 0
    status: str = "idle"


class SessionDetail(BaseModel):
    id: str
    title: str = "新对话"
    messages: list[AgentMessage] = Field(default_factory=list)
    status: str = "idle"
    summary: str = ""
    created_at: str = ""
    updated_at: int = 0
    # 最近一次生成的上下文用量（估算入模 token vs 完整上下文窗口），持久化以便刷新后仍可展示
    context_usage: Optional[dict[str, Any]] = None


class SessionCreateRequest(BaseModel):
    title: str = "新对话"


class SessionListResponse(BaseModel):
    sessions: list[SessionSummary] = Field(default_factory=list)
    count: int = 0


class GenerateRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    # Omit / null → unified agentic free-text path. Explicit → preset intent.
    skill_name: Optional[str] = None
    chapter_id: Optional[str] = None
    current_content: str = ""
    selected_text: str = ""
    user_input: str = Field(..., min_length=1)
    attachments: list[str] = Field(default_factory=list, max_length=5)
    chapter_rules: str = ""
    model: Optional[str] = None
    # 可选：前端选区/模型推断出的目标段落区间，形如
    # {"mode": "insert_after"|"replace_range", "startPara": 1, "endPara": 5}
    content_anchor: Optional[dict] = None
    # Future (not wired this phase): ask_reply: { ask_id, option_id | text }

    _check_user_input = non_blank("user_input")


# --- 引导页 AI 一键生成设定（无状态，项目创建前） ---


class OnboardingSection(str, enum.Enum):
    """引导页四区块之一；也用于单区重生成。"""

    worldview = "worldview"
    story_core = "story_core"
    characters = "characters"
    outline = "outline"


class OnboardingGenerateRequest(BaseModel):
    """无状态引导生成请求。

    项目尚未创建：仅携带前端当前已填内容作为上下文，不依赖 project_id/session_id。
    """

    # 用户核心想法/题材（必填前提）
    topic: str = ""
    genre: str = ""
    # 当前已填内容，作为生成上下文（已填的保留、空白项生成）
    worldview: str = ""
    story_core: dict[str, str] = Field(default_factory=dict)
    characters: list[dict[str, Any]] = Field(default_factory=list)
    synopsis: str = ""
    volumes: list[dict[str, Any]] = Field(default_factory=list)
    # 空 → 一次全量生成四区块；指定 → 仅重生成该区块
    section: Optional[OnboardingSection] = None
    model: Optional[str] = None


class OnboardingCharacter(BaseModel):
    name: str = ""
    role: str = ""
    profile: str = ""
    relationship: list[CharacterRelationship] = Field(default_factory=list)


class OnboardingVolume(BaseModel):
    name: str = ""
    summary: str = ""


class OnboardingGenerateResponse(BaseModel):
    """对齐引导页四区块；前端零转换直接回填。"""

    topic: str = ""
    genre: str = ""
    worldview: str = ""
    story_core: dict[str, str] = Field(default_factory=dict)
    characters: list[OnboardingCharacter] = Field(default_factory=list)
    synopsis: str = ""
    volumes: list[OnboardingVolume] = Field(default_factory=list)


# --- Agent Viewer (developer observation) ---


class RunListItem(BaseModel):
    run_id: str
    session_id: str = ""
    created_at: str = ""
    model: str = ""
    user_input: str = ""
    response_preview: str = ""
    modes: list[str] = Field(default_factory=list)
    skill_names: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    truncated: bool = False
    remaining_pct: Optional[float] = None
    latency_ms_total: int = 0
    step_count: int = 0


class RunListResponse(BaseModel):
    runs: list[RunListItem] = Field(default_factory=list)
    count: int = 0
