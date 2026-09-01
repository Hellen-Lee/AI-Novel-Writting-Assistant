# AI 小说创作 Agent

一款运行在本地的小说创作辅助工具，以 Web 页面形式提供：接入你自备的大模型 API，在浏览器中完成「新建项目 → AI 辅助创建设定 → 编辑续写 → 保存章节」的完整流程。所有项目数据本地存储，无云端依赖。

> 技术栈：前端 React 18 + Vite，后端 Python FastAPI，数据为本地 JSON / Markdown。模型调用走 OpenAI 兼容 HTTP 接口，可适配 GPT / Claude / DeepSeek / 通义等。

---

## 一、环境要求

| 依赖 | 最低版本 | 说明 |
| --- | --- | --- |
| Node.js | 18+ | 根目录脚本与前端构建均需；推荐 22.x |
| Python | 3.10+ | 后端运行；推荐 3.12 / 3.13 |
| 大模型 API | OpenAI 兼容 | 自备 `api_base` + `api_key` + `model` |

Windows 推荐使用 Git Bash 执行脚本命令。

---

## 二、安装

首次使用需安装前后端依赖：

```bash
# 1) 前端依赖
cd frontend
npm install
cd ..

# 2) 后端依赖（建议使用虚拟环境）
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

或直接用根目录一键安装脚本（会同时装前后端）：

```bash
npm run build:install
```

---

## 三、启动

### 开发模式（前后端热更新，推荐）

在仓库**根目录**执行：

```bash
npm run start
```

- 前端：`http://localhost:5173`（Vite dev，`/api` 代理到后端）
- 后端：`http://localhost:8001`（`python run.py`，带 reload）
- 停止：`Ctrl+C`（同时结束两侧）

### 生产模式（构建产物预览）

```bash
npm run build        # 打包 frontend/dist + 后端导入校验
npm run start:prod   # 后端 uvicorn（无 reload）+ 前端 vite preview
```

- 前端：`http://localhost:4173`
- 若尚无 `frontend/dist`，`start:prod` 会先自动执行一次 build

### 分目录启动（调试用）

```bash
# 后端
cd backend && python run.py

# 前端
cd frontend && npm run dev
```

---

## 四、首次使用

1. **打开浏览器**：访问 `http://localhost:5173`（开发）或 `http://localhost:4173`（生产预览）。
2. **配置模型 API**：点击首页右上角「设置」→「API」栏，填写：
   - `API 地址`：如 `https://api.openai.com/v1` 或你自建/代理的兼容端点
   - `API Key`：你的密钥
   - `默认模型`：如 `gpt-4o-mini`
   - 点击「测试连接」确认可用后「保存」
3. **新建项目**：首页「新建项目」进入单页引导，手动填写题材/内核/人物/大纲，或使用「AI 一键生成」补全空白项。
4. **进入编辑页**：左侧选择章节，中间编辑正文，右侧 Agent 对话栏点击「续写」等快捷指令调用 AI。
5. **保存**：章节正文会自动防抖保存（1s），也可手动点击「保存」。

---

## 五、数据存放

所有用户数据位于仓库根目录 `data/`（已被 `.gitignore` 忽略，可整体备份/迁移）：

```
data/
├── config.json           # 模型 API 配置
├── skills/               # 用户自定义 SKILL.md
└── projects/
    └── {project_id}/
        ├── meta.json          # 项目元信息
        ├── settings.json      # 全局规则、文风偏好
        ├── memory.json        # 长期设定（人物含关系内嵌）
        ├── outline.json       # 大纲与卷次
        ├── chapters/          # 章节正文（Markdown）
        └── agent/             # Agent 会话与 run 记录
```

---

## 六、测试

### 端到端冒烟测试

后端需先启动（`npm run start` 或 `cd backend && python run.py`）。然后在另一终端执行：

```bash
cd backend
venv\Scripts\python.exe tests\smoke_test.py                # 全部用例
venv\Scripts\python.exe tests\smoke_test.py --skip-model   # 跳过真实模型调用（离线）
venv\Scripts\python.exe tests\smoke_test.py --keep         # 保留测试项目不清理
```

覆盖：健康检查、API 配置、技能库 CRUD、项目/章节/设定/会话 CRUD、续写流式生成、润色、自由输入、引导页生成、Agent Viewer 观测、清理。模型相关用例未配置 API 时自动 SKIP。

### 构建校验

```bash
npm run build   # 包含后端导入校验（verify_build.py）
```

---

## 七、常见问题

| 现象 | 排查 |
| --- | --- |
| 前端打开白屏 | 确认后端已启动（`http://localhost:8001` 可访问）；查看浏览器控制台 |
| 续写无响应/报错 | 设置 → API：检查地址、密钥、模型；点击「测试连接」 |
| 模型返回空白 | 多见推理类模型 token 预算不足；可在设置中调大 `max_tokens` 或更换模型 |
| 数据丢失 | 所有数据在 `data/` 目录，定期备份该目录即可 |
| 端口被占用 | `5173` / `8001` / `4173` 被占时关闭对应进程或修改 `scripts/start.mjs` / `backend/run.py` |

---

## 八、文档

- [`AGENTS.md`](AGENTS.md)：项目概览、架构、API 索引与开发约定（给 AI 开发助手与人类开发者）
- [`docs/AI小说创作Agent_MVP开发计划.md`](docs/AI小说创作Agent_MVP开发计划.md)：MVP 开发计划与进度
- [`docs/build/`](docs/build/)：各模块架构决策记录
- [`docs/记忆规则与提示词组装.md`](docs/记忆规则与提示词组装.md)：记忆体系与提示词组装细节
- [`docs/Novel.pen`](docs/Novel.pen)：UI 设计稿

---

## 九、许可

个人本地使用，暂未指定开源协议。第三方依赖遵循各自许可。
