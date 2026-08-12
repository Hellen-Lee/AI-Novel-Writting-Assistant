"""
API 路由索引与统一挂载。

开发者查阅接口时优先看本文件顶部 API_INDEX；
业务实现在 routers/*.py + services/*，勿把 handler 全部堆进此文件。
"""

from __future__ import annotations

from fastapi import FastAPI

from app.routers import (
    chapters,
    config,
    generation,
    health,
    memory,
    projects,
    sessions,
    skills,
)

# METHOD, path（含 /api 前缀）, 简述
API_INDEX: list[tuple[str, str, str]] = [
    # health
    ("GET", "/api/health", "健康检查"),
    # config
    ("GET", "/api/config", "读取模型配置"),
    ("POST", "/api/config", "保存模型配置"),
    ("POST", "/api/config/test", "测试模型连接"),
    ("POST", "/api/config/models", "拉取可用模型列表"),
    # projects
    ("GET", "/api/projects", "项目列表"),
    ("POST", "/api/projects", "创建项目"),
    ("GET", "/api/projects/{id}", "项目详情"),
    ("PUT", "/api/projects/{id}", "更新项目"),
    ("DELETE", "/api/projects/{id}", "删除项目"),
    # chapters
    ("GET", "/api/projects/{id}/chapters", "章节列表"),
    ("POST", "/api/projects/{id}/chapters", "新建或保存章节"),
    ("GET", "/api/projects/{id}/chapters/{cid}", "章节正文"),
    ("PUT", "/api/projects/{id}/chapters/{cid}", "更新章节"),
    # memory
    ("GET", "/api/projects/{id}/memory", "获取记忆"),
    ("PUT", "/api/projects/{id}/memory", "整体更新记忆"),
    ("POST", "/api/projects/{id}/memory/{category}", "新增记忆条目"),
    ("PUT", "/api/projects/{id}/memory/{category}/{eid}", "更新记忆条目"),
    ("DELETE", "/api/projects/{id}/memory/{category}/{eid}", "删除记忆条目"),
    # skills
    ("GET", "/api/skills", "技能列表（可按 kind 过滤）"),
    ("GET", "/api/skills/{name}", "技能详情"),
    ("PUT", "/api/skills/{name}", "新建/更新自定义技能"),
    ("DELETE", "/api/skills/{name}", "删除自定义技能"),
    # agent sessions
    ("GET", "/api/projects/{id}/agent/sessions", "Agent 会话列表"),
    ("POST", "/api/projects/{id}/agent/sessions", "新建 Agent 会话"),
    ("GET", "/api/projects/{id}/agent/sessions/{sid}", "会话详情（含消息）"),
    ("DELETE", "/api/projects/{id}/agent/sessions/{sid}", "删除会话"),
    # generation (SSE)
    ("POST", "/api/projects/{id}/generate", "Agent 流式生成（SSE；可选 skill_name / Router）"),
]


def register_routers(app: FastAPI) -> None:
    """Mount all HTTP routers under /api (and health)."""
    app.include_router(health.router, prefix="/api", tags=["health"])
    app.include_router(config.router, prefix="/api", tags=["config"])
    app.include_router(projects.router, prefix="/api", tags=["projects"])
    app.include_router(chapters.router, prefix="/api", tags=["chapters"])
    app.include_router(memory.router, prefix="/api", tags=["memory"])
    app.include_router(skills.router, prefix="/api", tags=["skills"])
    app.include_router(sessions.router, prefix="/api", tags=["sessions"])
    app.include_router(generation.router, prefix="/api", tags=["generation"])
