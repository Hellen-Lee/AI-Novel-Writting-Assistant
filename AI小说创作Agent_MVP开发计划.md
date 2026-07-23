# AI 小说创作 Agent — MVP 开发计划大纲

> 目标：一周内完成 MVP，实现本地启动 Web 应用后可完成"新建项目 → AI 辅助创建设定 → 编辑续写 → 保存章节"的完整流程。  
> 开发方式：AI coding 辅助，人类把控方向与验收。

---

## 一、项目初始化（第 1 天）

### 1.1 目录与工程初始化

- [ ] 创建 `frontend/` 目录，初始化 React 18 + Vite 项目
- [ ] 创建 `backend/` 目录，初始化 FastAPI 项目
- [ ] 创建 `data/` 与 `.gitignore`（忽略 `data/` 与依赖目录）
- [ ] 安装基础依赖
  - 前端：`react`, `react-dom`, `react-router-dom`, `axios`
  - 后端：`fastapi`, `uvicorn`, `pydantic`, `python-dotenv`, `httpx`

### 1.2 基础启动脚本

- [ ] 后端 `backend/run.py` 启动 FastAPI 服务
- [ ] 前端 `npm run dev` 可访问页面
- [ ] 前端配置 Vite 代理到 `localhost:8000`
- [ ] 测试前后端连通（Hello World 接口）

### 1.3 设计本地数据结构

- [ ] 确定项目目录结构（`data/projects/{project_id}/...`）
- [ ] 设计 `meta.json`、`settings.json`、`memory.json`、`outline.json` 字段
- [ ] 设计章节正文存储方式（Markdown 文件）

---

## 二、后端基础模块（第 1–2 天）

### 2.1 本地配置模块（config.py）

- [ ] 读写 `data/config.json`（API 地址、密钥、默认模型、参数）
- [ ] 提供默认值与配置校验

### 2.2 项目文件管理

- [ ] 实现项目 CRUD 接口
  - `GET /api/projects`
  - `POST /api/projects`
  - `GET /api/projects/{id}`
- [ ] 实现章节 CRUD 接口
  - `GET /api/projects/{id}/chapters`
  - `POST /api/projects/{id}/chapters`
  - `GET /api/projects/{id}/chapters/{cid}`
- [ ] 封装项目目录读写工具函数

### 2.3 记忆管理（memory_store）

- [ ] 实现 `memory.json` 读写
- [ ] 分类结构：世界观、人物、物品、剧情要点
- [ ] 提供接口：
  - `GET /api/projects/{id}/memory`
  - `PUT /api/projects/{id}/memory`

### 2.4 模型调用（model_client）

- [ ] 封装 OpenAI 兼容接口调用
- [ ] 从 `config.json` 读取配置
- [ ] 实现流式返回（可选，MVP 可先非流式）
- [ ] 接口：`POST /api/config/test` 测试连接

---

## 三、SKILL.md 体系（第 2–3 天）

### 3.1 SKILL.md 文件设计

- [ ] 设计 SKILL.md 格式规范（YAML frontmatter + Markdown body）
- [ ] 创建内置 SKILL.md：
  - `backend/app/skills/continue.md`
  - `backend/app/skills/polish.md`
  - `backend/app/skills/expand.md`
  - `backend/app/skills/generate_setting.md`
- [ ] 预留 `backend/app/skills/custom/` 用户自定义目录

### 3.2 技能加载器（skill_loader）

- [ ] 启动时扫描 `skills/` 和 `skills/custom/`
- [ ] 解析 name、description、system、user_template
- [ ] 校验必填字段
- [ ] 按名称提供给 `prompt_builder`

### 3.3 提示词组装（prompt_builder）

- [ ] 根据 skill 名称加载对应 SKILL.md
- [ ] 注入变量：规则、记忆、最近 3 章、当前内容、用户输入
- [ ] 输出 `{system, user}` 给 model_client

---

## 四、前端页面开发（第 3–5 天）

### 4.1 路由与布局

- [ ] 配置 `react-router-dom` 路由
- [ ] 主布局：侧边栏导航 + 内容区
- [ ] 页面：首页、新建项目、编辑页、设定管理、模型配置

### 4.2 首页 / 项目列表

- [ ] 展示本地项目卡片
- [ ] 新建项目按钮
- [ ] 删除项目（可选）

### 4.3 新建项目引导页

- [ ] 5 步分步表单：题材世界观、故事内核、角色、大纲、确认
- [ ] 每步支持手动填写
- [ ] 关键步骤可调用 AI 辅助生成（Step 1、3、4）
- [ ] 确认后创建项目目录与初始文件

### 4.4 编辑页（核心）

- [ ] 三栏布局：
  - 左侧：章节列表 + 最近 3 章正文
  - 中间：章节编辑器（文本域）
  - 右侧：设定面板 / 规则面板 / 快捷指令
- [ ] 章节保存功能
- [ ] 快捷指令按钮：续写、润色、扩写、生成设定
- [ ] AI 生成结果展示与操作：采纳、丢弃、重新生成
- [ ] 生成 loading 状态与中断按钮

### 4.5 设定管理页

- [ ] 分类展示人物、物品、世界观、剧情要点
- [ ] 支持新增、编辑、删除记忆条目
- [ ] 变更后自动保存到 `memory.json`

### 4.6 模型配置页

- [ ] 表单：API 地址、密钥、模型名、温度、最大 token
- [ ] 保存到 `data/config.json`
- [ ] 测试连接按钮

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
- [ ] 测试模型配置与连接
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
- [ ] 能成功创建项目并通过 5 步引导初始化
- [ ] 能在编辑页调用 AI 续写，并将结果采纳到正文
- [ ] 章节内容保存后，重新进入项目可读取
- [ ] 设定管理中的修改能持久化并影响后续生成
- [ ] 模型配置能本地保存并通过连接测试
- [ ] 项目数据全部保存在 `data/` 目录下，无云端依赖

---

## 八、风险与应对

| 风险 | 应对 |
| --- | --- |
| 大模型 API 响应慢 | 增加 loading 与中断机制；MVP 使用非流式简化 |
| 长上下文超出 token 限制 | 记忆与上下文做截断；优先注入高相关信息 |
| 生成内容不符合预期 | 提示词迭代优化；提供丢弃/重试功能 |
| 本地文件损坏或丢失 | 数据目录结构简单，用户可手动备份 |
| 开发时间超出预期 | 优先保证"续写"主流程，其他 skill 可降级 |

---

## 九、MVP 后可选方向

- 打包为桌面 EXE（Electron / Tauri）
- 流式生成输出
- 记忆进化节点自动提示
- 单章临时规则
- 用户自定义 SKILL.md 前端管理界面
- 设定冲突检测
