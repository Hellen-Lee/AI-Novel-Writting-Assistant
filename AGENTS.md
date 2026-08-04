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
│   │   ├── main.py           # FastAPI 入口
│   │   ├── config.py         # 配置读取
│   │   ├── routers/          # API 路由
│   │   │   ├── projects.py
│   │   │   ├── chapters.py
│   │   │   ├── memory.py
│   │   │   ├── rules.py
│   │   │   └── generation.py
│   │   ├── services/         # 业务逻辑
│   │   │   ├── model_client.py
│   │   │   ├── prompt_builder.py
│   │   │   ├── memory_store.py
│   │   │   └── skill_loader.py
│   │   └── skills/           # SKILL.md 文件目录
│   │       ├── continue.md          # kind: quick_action
│   │       ├── polish.md
│   │       ├── expand.md
│   │       ├── generate_setting.md
│   │       └── custom/              # 用户自定义（kind: skill）
│   │   └── models/           # Pydantic 数据模型
│   │       └── schemas.py
│   ├── requirements.txt
│   └── run.py
└── data/                     # 本地数据目录（运行时生成）
    ├── config.json           # 模型配置
    └── projects/             # 项目数据
        └── {project_id}/
            ├── meta.json
            ├── settings.json
            ├── memory.json
            ├── outline.json
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
├─────────────────────────────────────┤
│  本地存储：SQLite / JSON            │
├─────────────────────────────────────┤
│  外部：用户自备大模型 API            │
└─────────────────────────────────────┘
```

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
  - **续写（Continue）**：基于上下文续写下一段正文。
  - **润色（Polish）**：优化当前选中的段落。
  - **扩写（Expand）**：将简短描述扩写成完整场景或段落。
  - **生成设定（Generate Setting）**：根据输入生成人物、物品或世界观设定。
- 每个快捷指令对应后端一个 SKILL.md；前端只传 `name` 与上下文，不维护提示词正文。
- 也支持手动调用：`/continue`、`/polish` 等（与按钮等价）。

### 5.5 SKILL.md 体系

SKILL.md 统一放在 `backend/app/skills/`；`custom/` 为用户自定义目录。启动时由 `skill_loader` 扫描加载（同名时 `custom/` 覆盖内置）。

格式：YAML frontmatter + Markdown 正文（正文即 user 侧模板，支持 `$变量`）。

用 `kind` **显式区分**两类技能：

| kind | 用途 | system | 正文 | `disable-model-invocation` | 调用方式 |
| --- | --- | --- | --- | --- | --- |
| `quick_action` | 四个快捷按钮 | **必填**（frontmatter） | 必填 | 可选，默认 `true` | 按钮或 `/name` |
| `skill` | 其他内置 / 用户自建 | **禁止**（调用时固定为空） | 必填 | 可选，默认 `true` | `/name` 或技能列表 |

字段说明：

- `name`：唯一标识（小写字母/数字/下划线或连字符），亦为 `/` 调用名。
- `description`：功能说明；供列表展示，并为后续「模型自动选用」预留。
- `kind`：`quick_action` \| `skill`。
- `system`：仅 `quick_action` 使用。
- `disable-model-invocation`：为 `true` 时禁止模型根据 description 自动选用该技能（MVP 不做自动选用，但字段落地并校验；两种 kind 均可手动调用）。
- 正文：用户消息模板；常见变量如 `$worldview`、`$characters`（含内嵌关系）、`$story_core`、`$synopsis`、`$volumes`、`$previous_chapters`、`$current_content`、`$selected_text`、`$user_input`、`$global_rules`、`$chapter_rules` 等。

示例（quick_action）：

```markdown
---
name: continue
description: 基于上下文续写下一段正文
kind: quick_action
disable-model-invocation: true
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
name: scene-beat
description: 根据情节点列出场景节拍。手动调用：/scene-beat
kind: skill
disable-model-invocation: true
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
- **编辑页右侧**：AI Agent 对话栏；右上角为历史会话、新建对话、临时规则遮罩（非「设定/规则/技能」多 Tab）。
- **快捷指令**：对话栏底栏按钮或 `/name`，与 SKILL.md 对应。
- **全局设置**：首页右上角「设置」进入；侧栏三栏为**通用 / API / skill**（API = 原模型配置，skill = 原技能库管理）。详见 `docs/build/05-全局设置面板.md`。

---

## 6. API 路由规划（初步）

| 路由 | 说明 |
| --- | --- |
| `GET /api/projects` | 项目列表 |
| `POST /api/projects` | 创建项目 |
| `GET /api/projects/{id}` | 项目详情 |
| `GET /api/projects/{id}/chapters` | 章节列表 |
| `POST /api/projects/{id}/chapters` | 新建/保存章节 |
| `GET /api/projects/{id}/chapters/{cid}` | 章节正文 |
| `GET /api/projects/{id}/memory` | 获取记忆 |
| `PUT /api/projects/{id}/memory` | 更新记忆 |
| `POST /api/projects/{id}/generate` | AI 生成（续写/润色等） |
| `GET /api/skills` | 技能列表（可按 kind 过滤） |
| `GET /api/skills/{name}` | 技能详情 |
| `GET /api/config` | 读取模型配置 |
| `POST /api/config` | 保存模型配置 |
| `POST /api/config/test` | 测试模型连接 |

---

## 7. 启动方式

在仓库**根目录**执行即可，无需再分别 `cd frontend` / `cd backend`。

### 开发（后端 + 前端热更新）

```bash
npm run start
```

- 前端：`http://localhost:5173`（Vite dev，`/api` 代理到后端）
- 后端：`http://localhost:8001`（`python run.py`，带 reload）
- 停止：`Ctrl+C`（同时结束两侧）

### 生产（构建产物预览）

```bash
npm run build        # 打包 frontend/dist + 后端导入校验
npm run start:prod   # 后端 uvicorn（无 reload）+ 前端 vite preview
```

- 前端：`http://localhost:4173`
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

## 9. 待补充项

后续随开发补充以下内容：
- 详细的 API 请求/响应定义
- 数据库/JSON Schema 定义
- 提示词模板库
- 前端路由与状态管理细节
- 测试与构建说明
- 打包为桌面应用的方案（如后续需要）
