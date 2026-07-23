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
├── frontend/                 # React 前端
│   ├── public/
│   ├── src/
│   │   ├── api/              # 后端 API 调用封装
│   │   ├── components/       # 通用组件
│   │   ├── pages/            # 页面：首页、引导、编辑页、设定管理、配置
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
│   │       ├── continue.md
│   │       ├── polish.md
│   │       ├── expand.md
│   │       ├── generate_setting.md
│   │       └── custom/       # 用户自定义 SKILL.md
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

- 根据任务类型（续写、润色、生成设定等）选择提示词模板。
- 注入以下内容：
  - 全局规则 + 单章规则
  - 长期记忆（人物、物品、世界观等）
  - 最近 3 章正文
  - 当前章节已有内容
- 输出 `{system, user}` 供 model_client 调用。

### 5.3 记忆管理（memory_store）

- 按项目维护 `memory.json`。
- 结构分为：世界观、人物、物品、剧情要点、人物关系等。
- 提供增删改查接口。
- 记忆进化：当字数/章节达到节点时，调用模型从新增内容中提取设定，弹窗让用户确认后再写入。

### 5.4 快捷指令（Quick Actions）

- 编辑页上的一组功能按钮，用户点击即可触发 AI 生成。
- MVP 内置四个快捷指令：
  - **续写（Continue）**：基于上下文续写下一段正文。
  - **润色（Polish）**：优化当前选中的段落。
  - **扩写（Expand）**：将简短描述扩写成完整场景或段落。
  - **生成设定（Generate Setting）**：根据输入生成人物、物品或世界观设定。
- 每个快捷指令对应后端一个 SKILL.md 文件，通过 `skill_loader` 读取并渲染为提示词。
- 前端按钮只负责传递指令类型和上下文，不直接维护提示词内容。

### 5.5 SKILL.md 体系

- SKILL.md 是 Agent 可调用的提示词文件，统一放在 `backend/app/skills/` 目录下。
- 内置 SKILL.md：
  - `continue.md`
  - `polish.md`
  - `expand.md`
  - `generate_setting.md`
- 用户可在 `backend/app/skills/custom/` 目录下创建自己的 SKILL.md，系统启动时自动加载。
- 每个 SKILL.md 包含：
  - `name`：技能名称
  - `description`：功能说明
  - `system`：系统提示词
  - `user_template`：用户提示词模板（支持变量注入）
- `skill_loader` 负责扫描目录、读取解析、校验格式，并按名称提供给 `prompt_builder` 使用。

### 5.6 项目文件管理

- 每个项目一个目录。
- `meta.json`：项目名、题材、创建时间、总字数等。
- `settings.json`：全局规则、文风偏好。
- `outline.json`：大纲与章节列表。
- `memory.json`：长期记忆。
- `chapters/`：章节正文，以 Markdown 存储。

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
| `GET /api/config` | 读取模型配置 |
| `POST /api/config` | 保存模型配置 |
| `POST /api/config/test` | 测试模型连接 |

---

## 7. 启动方式

### 后端

```bash
cd backend
pip install -r requirements.txt
python run.py
```

默认监听 `http://localhost:8000`。

### 前端

```bash
cd frontend
npm install
npm run dev
```

默认访问 `http://localhost:5173`，并代理到后端 `localhost:8000`。

---

## 8. 开发约定

- **先跑通 MVP 再扩展**：优先实现"新建项目 → 编辑续写 → 保存"主流程。
- **本地优先**：不引入任何需要联网账号的功能。
- **数据可备份**：项目文件采用人类可读的 JSON / Markdown，便于用户手动迁移。
- **提示词模板化**：所有 AI 生成任务都走 `prompt_builder` 和 `skill_loader`，避免散落硬编码提示词。
- **模型接口统一**：所有模型调用走 `model_client` 的 OpenAI 兼容封装。
- **错误处理**：模型调用失败、文件读写失败要给前端清晰报错。
- **从简原则**：能用 JSON 就不用数据库，能用自然语言规则就不用复杂规则引擎，能前端处理就不加后端接口。

---

## 9. 待补充项

后续随开发补充以下内容：
- 详细的 API 请求/响应定义
- 数据库/JSON Schema 定义
- 提示词模板库
- 前端路由与状态管理细节
- 测试与构建说明
- 打包为桌面应用的方案（如后续需要）
