# AGENTS.md

> 本文件用于向 AI 开发助手说明项目概览与开发约定。  
> 项目早期从简，后续随开发进展补充完善。

---

## 1. 项目概览

**项目名称**：AI 小说创作 Agent（本地个人版）

**定位**：一款运行在本地的小说创作辅助工具，以 Web 页面形式提供。核心能力包括：
- 接入用户自备的大模型 API 进行续写、润色、设定生成。
- 维护项目长期记忆（人物、物品、世界观等），减少设定冲突。
- 支持全局与单章创作规则注入，约束 AI 生成方向。
- 所有数据本地存储，无需云端账号。

**MVP 目标**：本地启动服务后，能在浏览器中完成"新建项目 → AI 辅助创建设定 → 编辑续写 → 保存章节"的完整流程。

---

## 2. 技术栈

| 层级 | 选型 | 说明 |
| --- | --- | --- |
| 前端 | React 18 + Vite | 单页 Web 应用 |
| 后端 | Python FastAPI | 本地 API 服务 |
| 数据存储 | SQLite + 本地 JSON | 无需外部数据库 |
| 模型调用 | OpenAI 兼容 HTTP 接口 | 适配 GPT / Claude / DeepSeek / 通义等 |
| 包管理 | npm（前端）+ uv/pip（后端） | 按习惯选择 |

---

## 3. 目录结构

```
AINovel/
├── AGENTS.md                 # 本文件
├── README.md                 # 项目说明（后续补充）
├── docs/
│   ├── Novel.pen             # UI 设计稿
│   ├── build/                # 模块开发架构决策记录（见 §8）
│   └── ...
├── frontend/                 # React 前端
│   ├── AGENT.md              # 前端开发规则与约束（JSX 结构、行数、职责划分）
│   ├── public/
│   ├── src/
│   │   ├── api/              # 后端 API 调用封装
│   │   ├── components/       # 通用组件
│   │   ├── pages/            # 页面：首页、单页引导、编辑页（含 Agent 对话栏）、设定管理、配置
│   │   ├── stores/           # 状态管理（早期可用 Context 或简单 State）
│   │   ├── utils/            # 工具函数
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── backend/                  # FastAPI 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI 入口（挂载 api_catalog）
│   │   ├── api_catalog.py    # 全部 API 索引 + include_router 唯一挂载点
│   │   ├── config.py         # 配置读取
│   │   ├── routers/          # 薄 HTTP 路由（按域拆分）
│   │   │   ├── projects.py
│   │   │   ├── chapters.py
│   │   │   ├── memory.py
│   │   │   ├── skills.py
│   │   │   ├── sessions.py   # Agent 会话 CRUD
│   │   │   ├── generation.py # POST generate（SSE）
│   │   │   └── agent_viewer.py # 开发者观测 API（/api/dev/...）
│   │   ├── services/         # 业务逻辑
│   │   │   ├── model_client.py
│   │   │   ├── prompt_builder.py
│   │   │   ├── memory_store.py
│   │   │   ├── skill_loader.py
│   │   │   ├── session_store.py
│   │   │   ├── generation_service.py
│   │   │   └── run_store.py
│   │   └── skills/           # 内置 SKILL.md（随仓库分发，只读）
│   │       ├── 续写.md              # kind: quick_action
│   │       ├── 润色.md
│   │       ├── 扩写.md
│   │       └── 生成设定.md
│   │   └── models/           # Pydantic 数据模型
│   │       └── schemas.py
│   ├── requirements.txt
│   └── run.py
└── data/                     # 本地数据目录（运行时生成，gitignore）
    ├── config.json           # 模型配置
    ├── skills/               # 用户自定义 SKILL.md（name 不得与内置重名）
    └── projects/             # 项目数据
        └── {project_id}/
            ├── meta.json
            ├── settings.json
            ├── memory.json
            ├── outline.json
            ├── agent/                # Agent 会话
            │   ├── sessions.json
            │   └── sessions/{sid}.json
            └── chapters/
                └── chapter_01.md
```

> 数据目录建议放在项目根目录 `data/`，便于用户备份。后续可改为用户主目录下的 `.ainovel/data`。

---

## 4. 架构总览

```
┌─────────────────────────────────────┐
│  前端 React (浏览器访问 localhost)    │
├─────────────────────────────────────┤
│  FastAPI 本地服务                    │
│  - 模型调用 (model_client)           │
│  - 提示词组装 (prompt_builder)       │
│  - 记忆读写 (memory_store)           │
│  - SKILL 加载 (skill_loader)         │
│  - Agent 会话 (session_store)        │
│  - 流式生成 (generation_service/SSE) │
├─────────────────────────────────────┤
│  本地存储：SQLite / JSON            │
├─────────────────────────────────────┤
│  外部：用户自备大模型 API            │
└─────────────────────────────────────┘
```

> HTTP 路由索引入口：`backend/app/api_catalog.py`（`API_INDEX` + `register_routers`）。架构说明见 `docs/build/06-Agent生成与会话链路.md`。

---

## 5. 核心模块

### 5.1 模型调用（model_client）

- 统一封装 OpenAI 兼容接口的 HTTP 请求。
- 从本地 `data/config.json` 读取 API 地址、密钥、模型、参数。
- 提供 `generate(system, messages, params)`（非流式）与 `generate_stream` / `iter_sse`（流式）供上层调用。
- MVP 生成任务默认走流式；连接测试等可用非流式。
- MVP 只支持单一默认模型配置。

### 5.2 提示词组装（prompt_builder）

- 按 skill `name` 加载对应 SKILL.md，渲染正文中的 `$变量`。
- 可注入：全局/单章规则、长期记忆、最近 3 章、当前章节内容、选中文本、用户输入等。
- 按 `kind` 组装发给模型的消息：
  - `quick_action`：`system` = frontmatter 中的 `system`，`user` = 渲染后正文。
  - `skill`：`system` 固定为空字符串，`user` = 渲染后正文。
- 输出 `{system, user}` 供 model_client 调用。

### 5.3 记忆管理（memory_store）

- 按项目维护 `memory.json`（设定数据）。
- 顶层分类：`worldview`、`characters`、`story_core`（**无**独立 `relationships`；已弃用 `items` / `plot_points`）。
- 人物条目为 CharacterEntry：`name`、`profile`、`relationship: [{ type, target }]`（`type` 允许中文，原样存储）、`tags` 等；人物关系内嵌于人物。
- 全本大纲（`synopsis` + `volumes`）存在 `outline.json`，由设定库「大纲」栏编辑，不进 `memory.json`。
- 提供增删改查接口。
- 记忆进化：当字数/章节达到节点时，调用模型从新增内容中提取设定，弹窗让用户确认后再写入。

### 5.4 快捷指令（Quick Actions）

- 编辑页上的一组功能按钮，用户点击即可触发 AI 生成。
- MVP 内置四个快捷指令（均为 `kind: quick_action`）：
  - **续写**：基于上下文续写下一段正文。
  - **润色**：优化当前选中的段落。
  - **扩写**：将简短描述扩写成完整场景或段落。
  - **生成设定**：根据输入生成人物、物品或世界观设定。
- 每个快捷指令对应后端一个 SKILL.md；前端只传 `name` 与上下文，不维护提示词正文。
- 也支持手动调用：`/续写`、`/润色` 等（与按钮等价）。

### 5.5 SKILL.md 体系

内置 SKILL.md 放在 `backend/app/skills/`（设置页只读，不可编辑/覆盖）；用户自定义放在 `data/skills/`（本地数据，不入库）。启动时由 `skill_loader` 扫描加载；自定义 `name` 不得与内置重名。

格式：YAML frontmatter + Markdown 正文（正文即 user 侧模板，支持 `$变量`）。

用 `kind` **显式区分**两类技能：

| kind | 用途 | system | 正文 | `disable-model-invocation` | 调用方式 |
| --- | --- | --- | --- | --- | --- |
| `quick_action` | 四个快捷按钮 | **必填**（frontmatter） | 必填 | 可选，默认 `true` | 按钮、`/name`，或模型自动选用 |
| `skill` | 其他内置 / 用户自建 | **禁止**（调用时固定为空） | 必填 | 可选，默认 `true` | `/name`、技能列表，或模型自动选用 |

字段说明：

- `name`：唯一标识（中文、小写字母/数字，可用下划线或连字符），亦为 `/` 调用名。
- `description`：功能说明；供列表展示，并作为模型自动选用时的候选目录描述。
- `kind`：`quick_action` \| `skill`。
- `system`：仅 `quick_action` 使用。
- `disable-model-invocation`：为 `true` 时禁止模型根据 description 自动选用该技能（两种 kind 均可手动调用）。**模型自动选用**：自由输入（未指定 `skill_name`）时，后端先做一次轻量路由，从 `disable-model-invocation=false` 的 skill 目录中选一个注入其意图，未命中则走统一 agentic 自由文本路径；详见 `docs/changes/` 对应记录。
- 正文：用户消息模板；常见变量如 `$worldview`、`$characters`（含内嵌关系）、`$story_core`、`$synopsis`、`$volumes`、`$previous_chapters`、`$current_content`、`$selected_text`、`$user_input`、`$global_rules`、`$chapter_rules` 等。

示例（quick_action）：

```markdown
---
name: 续写
description: 基于上下文续写下一段正文。手动调用：/续写
kind: quick_action
disable-model-invocation: false
system: |
  你是一位专业小说作者……
---
当前章节已有内容：
$current_content

请续写……
```

示例（skill）：

```markdown
---
name: 场景节拍
description: 根据情节点列出场景节拍。手动调用：/场景节拍
kind: skill
disable-model-invocation: false
---
当前章节：
$current_content

用户补充：
$user_input
```

`skill_loader` 负责扫描、解析、校验并按名称提供给 `prompt_builder`。

### 5.6 项目文件管理

- 每个项目一个目录。
- `meta.json`：项目名、题材、创建时间、总字数等。
- `settings.json`：全局规则、文风偏好。
- `outline.json`：大纲与章节列表。
- `memory.json`：长期设定/记忆（人物含 `profile` + `relationship: [{ type, target }]`）。
- `chapters/`：章节正文，以 Markdown 存储。

### 5.7 前端关键页面约定（与设计稿对齐）

- **单页引导**：题材/内核/人物/大纲同一页；支持 AI 一键生成全部；卡片可模态展开编辑。
- **设定库**：侧栏四类（世界观 / 故事内核 / 人物 / 全本大纲）+ 卡片工作区；点卡片展开编辑；布局约束见 `frontend/AGENT.md` §5。
- **编辑页**：正文区右上角工具栏切换 **Agent 对话 / 规则 / 导出（占位）**；右侧整栏在 Agent 与「创作规则」间切换（规则不再嵌在 Agent 遮罩内）。Agent 头栏为历史会话、新建对话、收起。
- **快捷指令**：对话栏底栏按钮或 `/name`，与 SKILL.md 对应。
- **全局设置**：首页右上角「设置」进入；侧栏三栏为**通用 / API / skill**（API = 原模型配置，skill = 原技能库管理）。详见 `docs/build/05-全局设置面板.md`。

---

## 6. API 路由与 JSON Schema

> 完整 METHOD + path 索引见 [`backend/app/api_catalog.py`](backend/app/api_catalog.py) 顶部 `API_INDEX`（唯一挂载点 `register_routers`）。
> 所有路由统一挂在 `/api` 前缀下；错误返回统一为 `{"detail": <string|pydantic 错误数组>}`，前端 `getErrorMessage` 统一解析。

### 6.1 路由表

| 方法 | 路径 | 说明 | 请求体 / 参数 |
| --- | --- | --- | --- |
| GET | `/api/health` | 健康检查 | — |
| GET | `/api/config` | 读取模型配置（密钥脱敏） | — |
| POST | `/api/config` | 保存模型配置 | `ConfigUpdateRequest` |
| POST | `/api/config/test` | 测试模型连接（body 可覆盖未保存值） | `ConfigProbeRequest?` |
| GET | `/api/config/models` | 用已存配置拉取可用模型列表 | — |
| POST | `/api/config/models` | 拉取模型列表（body 可覆盖） | `ConfigProbeRequest?` |
| GET | `/api/projects` | 项目列表 | — |
| POST | `/api/projects` | 创建项目（同时建首章） | `ProjectCreateRequest` |
| GET | `/api/projects/{id}` | 项目详情（meta+settings+outline+memory+章节摘要） | — |
| PUT | `/api/projects/{id}` | 更新项目（任意字段） | `ProjectUpdateRequest` |
| DELETE | `/api/projects/{id}` | 删除项目 | — |
| GET | `/api/projects/{id}/chapters` | 章节列表（摘要） | — |
| POST | `/api/projects/{id}/chapters` | 新建或按 id 更新章节 | `ChapterCreateRequest` |
| GET | `/api/projects/{id}/chapters/{cid}` | 章节正文 | — |
| PUT | `/api/projects/{id}/chapters/{cid}` | 更新章节标题/正文 | `ChapterUpdateRequest` |
| GET | `/api/projects/{id}/memory` | 获取记忆 | — |
| PUT | `/api/projects/{id}/memory` | 整体替换记忆 | `ProjectMemory` |
| POST | `/api/projects/{id}/memory/{category}` | 新增记忆条目（`worldview`/`characters`/`story_core`） | `MemoryEntryCreateRequest` |
| PUT | `/api/projects/{id}/memory/{category}/{eid}` | 更新记忆条目 | `MemoryEntryUpdateRequest` |
| DELETE | `/api/projects/{id}/memory/{category}/{eid}` | 删除记忆条目 | — |
| GET | `/api/skills` | 技能列表（可 `?kind=quick_action|skill`） | `?kind` |
| GET | `/api/skills/{name}` | 技能详情（含 system/user_template） | — |
| PUT | `/api/skills/{name}` | 新建/更新自定义技能（内置不可覆盖） | `SkillUpsertRequest` |
| DELETE | `/api/skills/{name}` | 删除自定义技能（内置不可删） | — |
| GET | `/api/projects/{id}/agent/sessions` | Agent 会话列表 | — |
| POST | `/api/projects/{id}/agent/sessions` | 新建会话 | `SessionCreateRequest` |
| GET | `/api/projects/{id}/agent/sessions/{sid}` | 会话详情（含消息） | — |
| DELETE | `/api/projects/{id}/agent/sessions/{sid}` | 删除会话（204） | — |
| POST | `/api/projects/{id}/generate` | Agent 流式生成（SSE；可带 `skill_name` 或走 Router） | `GenerateRequest` |
| POST | `/api/onboarding/generate` | 引导页 AI 一键生成设定（无状态，JSON 响应） | `OnboardingGenerateRequest` |
| GET | `/api/dev/projects/{id}/agent/runs` | Agent Viewer：run 列表（无 prompt 正文） | — |
| GET | `/api/dev/projects/{id}/agent/runs/{run_id}` | Agent Viewer：run 详情（含 prompt/回复） | — |
| GET | `/api/dev/projects/{id}/agent/runs/{run_id}/steps/{step_index}/reasoning` | Agent Viewer：按需读取单 step 完整 reasoning（仅本机） | — |
| GET | `/api/dev/projects/{id}/agent/sessions/{sid}/runs` | Agent Viewer：某会话全部 run 详情 | — |

### 6.2 核心 Schema 摘要

> 完整定义见 [`backend/app/models/schemas.py`](backend/app/models/schemas.py)。下方只列关键字段；`Optional` 表示可省略。

#### 配置

```jsonc
// ConfigUpdateRequest / ConfigProbeRequest（部分字段可选）
{
  "api_base": "https://api.openai.com/v1",   // http(s):// 开头
  "api_key": "sk-...",                        // 写入时明文；读取时脱敏为 "abcd****wxyz"
  "model": "gpt-4o-mini",                     // 非空
  "context_window": 131072,                   // ∈ {32768, 65536, 131072}
  "temperature": 0.7,                          // 0..2
  "top_p": 0.9,                                // 0..1
  "max_tokens": 2048,                           // 1..128000
  "reasoning_step_max_chars": 64000,            // 未压缩字符上限
  "reasoning_run_max_chars": 256000,            // 单 run 未压缩字符上限
  "reasoning_project_quota_bytes": 134217728,   // 项目 sidecar 磁盘配额
  "reasoning_retention_runs": 200               // 最多保留含 sidecar 的 run 数
}
// ConfigResponse = 上述字段 + api_key_configured: bool（密钥返回脱敏值）
// ConfigTestResponse { ok, message, model, models_count?, models: [str], preview? }
```

#### 项目

```jsonc
// ProjectCreateRequest
{
  "name": "书名",           // 必填，min_length=1；纯空白会被拒（422）
  "genre": "都市奇幻",       // 可选
  "description": "...",
  "global_rules": "...",
  "style_preference": "...",
  "synopsis": "...",
  "first_chapter_title": "第一章 雪落"  // 省略时默认「第一章」
}
// ProjectUpdateRequest：所有字段 Optional；空请求体返回 400
// ProjectDetail { meta: ProjectMeta, settings: ProjectSettings,
//                 outline: ProjectOutline, memory: ProjectMemory, chapters: [ChapterSummary] }
```

#### 章节

```jsonc
// ChapterCreateRequest（带 id 即更新，不带即新建）
{ "id": "abc123"?, "title": "第一章 雪落"?, "content": "正文..."? }
// ChapterUpdateRequest { title?: str (min_length=1), content?: str }
// ChapterDetail { id, order, title, content, word_count, updated_at }
```

#### 记忆 / 设定库

```jsonc
// ProjectMemory
{
  "worldview":   [ MemoryEntry ],
  "characters":  [ CharacterEntry ],
  "story_core":  [ MemoryEntry ]   // 无 items / plot_points（已弃用）
}
// MemoryEntry { id?, name: str(min1), content: str, tags: [str]?, updated_at? }
// CharacterEntry { id?, name: str(min1), profile: str,
//                  relationship: [ { type: str, target: str } ],   // type 允许中文
//                  tags: [str]?, updated_at? }
// 人物接受 legacy `content` 作为 profile 兜底；MemoryEntryCreateRequest 同体（character 含 profile+relationship）
// MemoryEntryUpdateRequest：所有字段 Optional；空请求体返回 400
```

#### 技能

```jsonc
// SkillUpsertRequest（PUT /api/skills/{name}）
{
  "name": "场景节拍",                          // 非空
  "description": "根据情节点列出场景节拍",       // 非空
  "kind": "skill",                            // ∈ {quick_action, skill}
  "disable_model_invocation": false,           // bool
  "system": "",                               // quick_action 必填；skill 禁止（留空）
  "user_template": "当前章节：\n$current_content\n\n用户补充：\n$user_input"  // 非空，支持 $变量
}
// SkillDetail = SkillSummary + system + user_template + source(builtin|custom) + path?
// 内置技能 PUT 返回 400；正文为空白 PUT 返回 422
```

#### 会话与生成

```jsonc
// SessionCreateRequest { title: str = "新对话" }
// AgentMessage { id, role: "user"|"assistant", content, pending?: bool,
//                skill?: str, error?: str, status?: "generating"|"idle", created_at }
// SessionDetail { id, title, messages: [AgentMessage], summary?, summary_at_round_count?, updated_at }

// GenerateRequest（POST /api/projects/{id}/generate，返回 SSE 流）
{
  "session_id": "sid",          // 必填
  "skill_name": "续写"?,        // 省略/null → Router 自由文本路径
  "chapter_id": "cid"?,
  "current_content": "本章已写正文...",
  "selected_text": "选中的待润色片段",   // 润色等用
  "user_input": "请续写下一段",
  "chapter_rules": "本章临时规则",
  "model": "gpt-4o-mini"?       // 覆盖本次调用的默认模型
}
// SSE 帧：{"type":"meta", session_id, user_message_id, assistant_message_id,
//          mode:"agent", skill_name, preset, draft: bool}
//        {"type":"tool_progress","tools":[{name, arguments}]}
//        {"type":"thinking","text":"..."}       // reasoning 增量，不进正文
//        {"type":"content","content":"增量文本"}
//        {"type":"error","error":"..."}
//        data: [DONE]
// draft=true → 前端展示「采纳/丢弃/重新生成」卡片；draft=false → 聊天气泡
```

#### 引导页生成（无状态）

```jsonc
// OnboardingGenerateRequest
{
  "topic": "旧城区守夜人与漫长冬夜",   // 必填前提
  "genre": "都市奇幻",
  "worldview": "",                      // 已填则保留作为上下文
  "story_core": { "冲突": "..." },       // dict[str,str]
  "characters": [ { name, role, profile, relationship } ],  // list[dict]
  "synopsis": "",
  "volumes": [ { name, summary } ],
  "section": "worldview"?,              // 空→全量；指定→单区重生成（worldview|story_core|characters|outline）
  "model": "..."?
}
// OnboardingGenerateResponse 对齐四区块，前端零转换回填
```

#### Agent Viewer（仅观测，无 prompt 正文在列表）

```jsonc
// RunListItem { run_id, session_id, created_at, model, user_input,
//               response_preview, modes: [str], skill_names: [str],
//               tools: [str], truncated, remaining_pct?, latency_ms_total, step_count }
// RunListResponse { runs: [RunListItem], count }
// run 详情见 run_store.get_run 的 JSON 结构（含 steps、system/user/response、budget_report 等）
// step.reasoning 为受限预览；step.reasoning_ref 指向
// agent/reasoning/{run_id}/step_{step_index}.txt.gz，完整内容通过按需接口读取
```

---

## 7. 启动方式

在仓库**根目录**执行即可，无需再分别 `cd frontend` / `cd backend`。

### 开发（后端 + 前端热更新）

```bash
npm run start
```

- 前端：`http://localhost:5173`（Vite dev，`/api` 代理到后端）
- 观测：`http://localhost:5173/dev/agent-viewer`（Agent Viewer，终端可点；产品页无入口）
- 后端：`http://localhost:8001`（`python run.py`，带 reload）
- 停止：`Ctrl+C`（同时结束两侧）

### 生产（构建产物预览）

```bash
npm run build        # 打包 frontend/dist + 后端导入校验
npm run start:prod   # 后端 uvicorn（无 reload）+ 前端 vite preview
```

- 前端：`http://localhost:4173`
- 观测：`http://localhost:4173/dev/agent-viewer`
- 若尚无 `frontend/dist`，`start:prod` 会先自动执行一次 build

### 仅构建

```bash
npm run build
# 可选：npm run build:install / build:frontend / build:backend
```

### 分目录启动（调试用）

```bash
# 后端
cd backend && python run.py

# 前端
cd frontend && npm run dev
```

---

## 8. 开发约定

- **先跑通 MVP 再扩展**：优先实现"新建项目 → 编辑续写 → 保存"主流程。
- **本地优先**：不引入任何需要联网账号的功能。
- **数据可备份**：项目文件采用人类可读的 JSON / Markdown，便于用户手动迁移。
- **提示词模板化**：所有 AI 生成任务都走 `prompt_builder` 和 `skill_loader`，避免散落硬编码提示词。
- **模型接口统一**：所有模型调用走 `model_client` 的 OpenAI 兼容封装。
- **错误处理**：模型调用失败、文件读写失败要给前端清晰报错。
- **从简原则**：能用 JSON 就不用数据库，能用自然语言规则就不用复杂规则引擎，能前端处理就不加后端接口。
- **架构决策落盘（`docs/build/`）**：开发模块时同步写下「如何设计架构、如何搭建、如何划分职责、为何如此」的 Markdown，供后续 Agent / 开发者接手；不是 API 说明书，也不是复述代码。粒度：
 - **核心模块或改动较大** → 单独一篇（如编辑页、生成链路、记忆体系）。
 - **模块较简单、改动小，或同一次开发多个模块** → 合并为一篇（示例：`docs/build/04-前端路由布局与首页.md` 覆盖 4.1 + 4.2）。
 - 文件名建议带阶段/主题前缀，文内标明对应计划章节、设计稿节点与关键代码路径。
- **迭代/重构过程文档（`docs/changes/`）**：重大重构、IA 变更等写在此处，文件名前缀用日期（如 `260804-设定库新IA与卡片工作区.md`），避免与 `docs/build/` 初期架构笔记混写。

---

## 9. 已知问题与下一步

### 9.1 已知问题（MVP 阶段）

- **上下文 token 截断仅做预算裁剪**：`context_budget` 按窗口大小裁剪历史/记忆，未做语义摘要压缩；长篇累积后高相关信息可能被截掉。计划 §5.3 后续接入摘要压缩。
- **引导页 AI 一键生成依赖模型质量**：四区块协同生成在某些模型上会出现人物/大纲偏离题材；已填内容作为上下文补全空白项的链路对推理类模型 token 预算敏感，可能空返。
- **全局设置 · 通用栏为 UI 占位**：数据目录、自动保存、字数统计、删除确认等本地偏好尚未落地实现（计划 §4.6 未勾选项）。
- **Agent 工具调用兼容性**：部分 OpenAI 兼容模型不支持 `tools` / function calling；`generation_service` 已对 `ModelClientError` 做降级（退化为无工具流式），但推理类模型在工具决策轮可能因 reasoning token 挤占导致 content 与 tool_calls 同时为空，工具链路随机失效。
- **会话历史摘要降级为字符串截断**：`_fallback_summary` 在模型摘要失败时直接截断拼接，质量有限。
- **测试为冒烟脚本而非框架**：`tests/smoke_test.py` 覆盖端到端主流程与异常路径，但未拆分为 pytest 单元测试；模型相关用例依赖真实 API，离线时跳过。

### 9.2 下一步（MVP 后可选方向）

- 打包为桌面 EXE（Electron / Tauri），降低本地启动门槛。
- 记忆进化节点自动提示（字数/章节达阈值时调用模型提取设定，弹窗确认入库）。
- Agent 多会话历史持久化与按章临时规则持久化（当前临时规则仅随本次生成请求生效）。
- 全局设置 · 通用栏落地；skill 栏完善自定义 SKILL.md 编辑体验、校验与预览。
- 设定冲突检测（新增设定与已有记忆交叉校验）。
- 上下文语义摘要压缩（替代纯裁剪），保留高相关信息。
- 测试拆分为 pytest 单元测试 + 端到端集成，接入 CI。

### 9.3 文档索引

- [`README.md`](README.md)：安装、启动、使用说明（面向使用者）
- [`docs/AI小说创作Agent_MVP开发计划.md`](docs/AI小说创作Agent_MVP开发计划.md)：MVP 开发计划与进度勾选
- [`docs/build/`](docs/build/)：各模块架构决策记录（01–10）
- [`docs/记忆规则与提示词组装.md`](docs/记忆规则与提示词组装.md)：记忆体系与提示词组装细节
- [`docs/Novel.pen`](docs/Novel.pen)：UI 设计稿
