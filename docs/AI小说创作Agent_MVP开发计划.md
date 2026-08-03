# AI 小说创作 Agent — MVP 开发计划大纲

> 目标：一周内完成 MVP，实现本地启动 Web 应用后可完成"新建项目 → AI 辅助创建设定 → 编辑续写 → 保存章节"的完整流程。  
> 开发方式：AI coding 辅助，人类把控方向与验收。

---

## 一、项目初始化（第 1 天）✅ 已完成

### 1.1 目录与工程初始化 ✅

- [x] 创建 `frontend/` 目录，初始化 React 18 + Vite 项目
- [x] 创建 `backend/` 目录，初始化 FastAPI 项目
- [x] 创建 `data/` 与 `.gitignore`（忽略 `data/` 与依赖目录）
- [x] 安装基础依赖
  - 前端：`react`, `react-dom`, `react-router-dom`, `axios`
  - 后端：`fastapi`, `uvicorn`, `pydantic`, `python-dotenv`, `httpx`

### 1.2 基础启动脚本 ✅

- [x] 后端 `backend/run.py` 启动 FastAPI 服务
- [x] 前端 `npm run dev` 可访问页面
- [x] 前端配置 Vite 代理到 `localhost:8000`
- [x] 测试前后端连通（Hello World 接口）

### 1.3 设计本地数据结构 ✅

- [x] 确定项目目录结构（`data/projects/{project_id}/...`）
- [x] 设计 `meta.json`、`settings.json`、`memory.json`、`outline.json` 字段
- [x] 设计章节正文存储方式（Markdown 文件）

---

## 二、后端基础模块（第 1–2 天）✅ 已完成

### 2.1 本地配置模块（config.py）✅

- [x] 读写 `data/config.json`（API 地址、密钥、默认模型、参数）
- [x] 提供默认值与配置校验

### 2.2 项目文件管理 ✅

- [x] 实现项目 CRUD 接口
  - `GET /api/projects`
  - `POST /api/projects`
  - `GET /api/projects/{id}`
- [x] 实现章节 CRUD 接口
  - `GET /api/projects/{id}/chapters`
  - `POST /api/projects/{id}/chapters`
  - `GET /api/projects/{id}/chapters/{cid}`
- [x] 封装项目目录读写工具函数

### 2.3 记忆管理（memory_store）✅

- [x] 实现 `memory.json` 读写
- [x] 分类结构：世界观、人物、物品、剧情要点（人物含 `profile` + `relationship: [{ type, target }]`；不再单独顶层 `relationships[]`）
- [x] 提供接口：
  - `GET /api/projects/{id}/memory`
  - `PUT /api/projects/{id}/memory`

### 2.4 模型调用（model_client）✅

- [x] 封装 OpenAI 兼容接口调用
- [x] 从 `config.json` 读取配置
- [x] 实现流式返回（`generate_stream` / `iter_sse`；非流式 `generate` 保留给连接测试等）
- [x] 接口：`POST /api/config/test` 测试连接（另含 `/api/config/models` 模型列表）

---

## 三、SKILL.md 体系（第 2–3 天）✅ 已完成

> 约定：用 `kind: quick_action | skill` 显式区分。  
> - `quick_action`（continue/polish/expand/generate_setting）：保留 `system` 槽位，按钮或 `/name` 手动调用。  
> - `skill`（其他内置或 `custom/`）：无 `system`，调用时 system 固定为空；含 `disable-model-invocation`；可 `/name` 手动调用。  
> MVP 不做模型自动选用，但开关字段落地。

### 3.1 SKILL.md 文件设计 ✅

- [x] 设计 SKILL.md 格式规范（YAML frontmatter + Markdown body；`kind` 分流）
- [x] 创建内置 quick_action：
  - `backend/app/skills/continue.md`
  - `backend/app/skills/polish.md`
  - `backend/app/skills/expand.md`
  - `backend/app/skills/generate_setting.md`
- [x] 预留 `backend/app/skills/custom/`，并放 1 个 `kind: skill` 示例（`scene-beat.md`）

### 3.2 技能加载器（skill_loader） ✅

- [x] 启动时扫描 `skills/` 和 `skills/custom/`（custom 同名覆盖）
- [x] 解析 name、description、kind、system（仅 quick_action）、disable-model-invocation、正文
- [x] 按 kind 校验必填/禁止字段
- [x] 提供列表与按名称查询；挂 `GET /api/skills`、`GET /api/skills/{name}`

### 3.3 提示词组装（prompt_builder） ✅

- [x] 根据 skill 名称加载对应 SKILL.md
- [x] 注入变量：规则、记忆、最近 3 章、当前内容、选中文本、用户输入
- [x] quick_action → system=skill.system；skill → system=""
- [x] 输出 `{system, user}` 给 model_client

---

## 四、前端页面开发（第 3–5 天）

### 4.1 路由与布局 ✅

- [x] 配置 `react-router-dom` 路由
- [x] 主布局：顶栏 +（编辑/设定）侧边栏导航 + 内容区；编辑页含右侧 Agent 栏
- [x] 页面骨架：首页、新建项目、编辑页、设定管理、全局设置（占位/设计已定）

### 4.2 首页 / 项目列表 ✅

- [x] 展示本地项目卡片
- [x] 新建项目按钮
- [x] 删除项目（可选）

### 4.3 新建项目引导页（单页）

- [x] 单页四区块：题材&世界观、故事内核、主要角色、全本大纲
- [x] 支持手动填写；确认后创建项目目录与初始文件
- [ ] **AI 一键生成全部**（题材/内核/人物/大纲协同生成）— UI 占位，待生成链路
- [ ] 各区块可单独 AI 生成；已填内容作为上下文补全空白项 — UI 占位，待生成链路
- [x] 部分卡片点击展开，在模态窗中详细编辑后回写（世界观小框直编+展开；角色/卷添加开模态，卡片可横滑）

### 4.4 编辑页（核心）

- [x] 三栏布局：
  - 左侧：章节列表 + 最近 3 章上下文提示（正文注入待 §5）
  - 中间：章节编辑器（文本域）
  - 右侧：**AI Agent 对话栏**（界面；生成链路待 §5）
- [x] Agent 栏右上角：历史会话、新建对话、临时规则（遮罩层）
- [x] 对话区展示生成结果占位；底栏快捷指令：续写、润色、扩写、生成设定；支持 `/skill` 解析
- [x] 章节保存功能
- [x] AI 生成结果展示与操作 UI：采纳、丢弃、重新生成（真实生成待 §5）
- [x] 生成 loading 状态与中断按钮（界面预览；真流式中断待 §5）

### 4.5 设定管理页 ✅

- [x] 分类展示人物、物品、世界观、剧情要点
- [x] 人物条目含 `name` / `profile` / `relationship: [{ type, target }]`（`type` 允许中文）
- [x] 支持新增、编辑、删除设定条目
- [x] 变更后自动保存到 `memory.json`

### 4.6 全局设置面板

> 设计稿：`docs/Novel.pen` → `Review/Screen/Settings-{通用|API|skill}`；入口：首页右上角「设置」。  
> 原独立「模型配置」「Skills 技能库」画面已 Archive，开发以实现 Settings 三栏为准。架构说明见 `docs/build/05-全局设置面板.md`。

- [ ] 入口：首页右上角「设置」打开全局设置（侧栏三栏：**通用 / API / skill**）
- [ ] **通用**：数据目录、自动保存、字数统计、删除确认等本地偏好
- [ ] **API**（原模型配置）：API 地址、密钥、默认模型、生成参数；测试连接；保存到 `data/config.json`
- [ ] **skill**（原技能库管理）：内置 / 自定义 SKILL.md 列表与编辑（frontmatter + 正文模板）；新建 Skill

---

## 五、核心创作流程打通（第 5–6 天）

### 5.1 续写流程

- [ ] 编辑页点击"续写"
- [ ] 前端发送当前章节内容与上下文到后端
- [ ] 后端组装 prompt（规则 + 记忆 + 最近 3 章 + 当前内容）
- [ ] 调用模型生成结果
- [ ] 前端展示结果，用户可采纳到编辑器

### 5.2 其他快捷指令

- [ ] 润色：选中段落优化
- [ ] 扩写：将简短描述扩写
- [ ] 生成设定：根据输入生成人物/物品/世界观设定，可一键加入记忆库

### 5.3 上下文组装

- [ ] 读取最近 3 章正文
- [ ] 读取全局规则
- [ ] 读取长期记忆并注入 prompt
- [ ] 控制 token 长度，必要时做摘要或截断

---

## 六、调试、联调与收尾（第 6–7 天）

### 6.1 联调测试

- [ ] 完整走通：新建项目 → 引导 → 编辑页 → 续写 → 保存
- [ ] 测试全局设置 · API（模型配置与连接）及 skill 库管理入口
- [ ] 测试设定管理增删改查
- [ ] 测试不同 skill 的生成效果

### 6.2 异常处理

- [ ] 模型调用失败提示
- [ ] 文件读写失败提示
- [ ] 网络/配置错误提示
- [ ] 空状态与 loading 状态

### 6.3 代码整理

- [ ] 统一错误返回格式
- [ ] 前端提取 API 封装
- [ ] 后端接口参数校验
- [ ] 清理调试日志

### 6.4 文档补充

- [ ] 更新 `README.md`：安装、启动、使用说明
- [ ] 补充 `AGENTS.md` 中的 API 定义与 JSON Schema
- [ ] 记录已知问题与下一步计划

---

## 七、MVP 验收标准

- [ ] 本地启动前后端后，浏览器可正常访问
- [ ] 能成功创建项目并通过单页引导初始化（含 AI 一键生成或手动填写）
- [ ] 能在编辑页右侧 Agent 对话栏调用 AI 续写，并将结果采纳到正文
- [ ] 临时规则遮罩可编辑并随生成请求生效
- [ ] 章节内容保存后，重新进入项目可读取
- [ ] 设定管理中人物关系内嵌于角色并可持久化，影响后续生成
- [ ] 全局设置中 API 配置能本地保存并通过连接测试；skill 栏可管理技能库
- [ ] 项目数据全部保存在 `data/` 目录下，无云端依赖

---

## 八、风险与应对

| 风险 | 应对 |
| --- | --- |
| 大模型 API 响应慢 | 增加 loading 与中断机制；MVP 使用流式返回提升体感 |
| 长上下文超出 token 限制 | 记忆与上下文做截断；优先注入高相关信息 |
| 生成内容不符合预期 | 提示词迭代优化；提供丢弃/重试功能 |
| 本地文件损坏或丢失 | 数据目录结构简单，用户可手动备份 |
| 开发时间超出预期 | 优先保证"续写"主流程，其他 skill 可降级 |

---

## 九、MVP 后可选方向

- 打包为桌面 EXE（Electron / Tauri）
- 记忆进化节点自动提示
- Agent 多会话历史持久化；临时规则按章持久化
- 全局设置 · skill 栏完善（自定义 SKILL.md 编辑体验、校验与预览）
- 设定冲突检测
