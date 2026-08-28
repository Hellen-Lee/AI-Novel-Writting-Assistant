# Agent 生成与会话链路

> ⚠️ **部分废弃**：§5 的「Router 分流 + 全量上下文预塞」已由 [`09-Agent原生工具调用.md`](09-Agent原生工具调用.md) 取代（统一 agentic 路径、移除 `router_meta`）。本文的传输层 / 会话落盘 / 模块职责仍有效。
>
> 对应计划：`docs/AI小说创作Agent_MVP开发计划.md` §5.0（链路）→ §5.1（续写验收）  
> 轻量 Agent 本期：[`07-轻量Agent闲聊与Router.md`](07-轻量Agent闲聊与Router.md)、[`docs/轻量通用Agent开发方向.md`](../轻量通用Agent开发方向.md)  
> 设计稿：编辑页 Agent 栏（`d7ubn`）/ 历史壳（`OckRz`）  
> 代码：`backend/app/services/{session_store,generation_service,prompt_builder,context_budget,run_store}.py`、`routers/{sessions,generation,agent_viewer}.py`、`api_catalog.py`；前端 `api/{generate,sessions,agentViewer}.js`、`components/editor/Agent/`、`pages/AgentViewerPage.jsx`

本文记录传输层、会话落盘与模块职责取舍；**不是**接口字段说明书。

---

## 1. 目标边界

| 做 | 不做 / 另案 |
| --- | --- |
| `POST .../generate` HTTP SSE 流式生成 | 全双工 WebSocket |
| 按项目落盘多会话；列表 / 新建 / 切换 / 删除 | 历史搜索、按日分组、重命名 |
| 生成请求带 `session_id`；可选 `skill_name` | 开放式 tool loop |
| 显式 `skill_name` → skill；省略 → Router → chat / 可自动 skill | Router 与执行不共用一份巨包上下文 |
| 会话 `summary` + 最近轮次注入模型（chat / Router） | 确认卡片 `ask`（契约预留） |
| 前端：闲聊不进 `aiDraft`；skill 仍可写草稿 | 白名单工具 / Top-K 记忆 |

---

## 2. 为何 SSE 而非 WebSocket

小说 Agent 主路径是「一次技能或闲聊 → 单向流式正文」，不是 IDE 式双向 tool loop。后端已有 `model_client.iter_sse`，前端可用 `fetch` + `AbortController`。

后续若做 Cursor 式确认卡片：仍用**多轮 HTTP**——本轮 SSE 以 `type: ask` 结束并标记会话 `waiting_user`，用户选择后再 `POST /generate`（或 `/continue`）继续流。不必先上 WS。

---

## 3. 会话与 run 落盘

```
data/projects/{project_id}/agent/
  sessions.json                 # 索引：id, title, updated_at, message_count, status
  sessions/{session_id}.json    # messages[] + summary
  runs/{run_id}.json            # 每次 generate 的 prompt/回复/预算（Agent Viewer 消费）
```

- `session_id` 由服务端生成（`sess_...`）。
- 会话字段：`summary`（对话摘要，默认 `""`）；旧文件缺省兼容。
- **后续口子（本期不落键）**：`waiting_user`、`pending_run`（随 `ask`）。
- 切换会话：前端改 `activeSessionId` 并拉取详情；若正在生成则**先 abort**。

---

## 4. 模块职责

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 索引 | `backend/app/api_catalog.py` | 罗列 METHOD + path；`include_router` 唯一挂载点 |
| 入口 | `main.py` | 调 `register_routers(app)` |
| HTTP | `routers/sessions.py`、`routers/generation.py`、`routers/agent_viewer.py` | 薄校验与 StreamingResponse / 观测只读 |
| 业务 | `session_store`、`generation_service` | 落盘、mode 编排、写会话 |
| 上下文 | `prompt_builder`、`context_budget` | 分流组装与预算截断 |
| 观测 | `run_store`、Agent Viewer | run JSON 落盘 + `/dev/agent-viewer` |
| 复用 | `model_client`、`skill_loader`、`prompt_loader` | 模型调用、skill 列表、通用提示词（`prompts/*.md`） |

---

## 5. 生成契约摘要

```text
POST /api/projects/{project_id}/generate
Body: session_id,
      skill_name?,          # 有则跳过 Router；无则自动选 / chat
      chapter_id?, current_content?, selected_text?, user_input?,
      chapter_rules?, model?
      # 后续预留（本期不接）：ask_reply

SSE:
  data: {"type":"router_meta","decision":"skill|chat|clarify","skill_name"?,"reason"?}
  data: {"type":"meta","session_id","user_message_id","assistant_message_id",
         "mode":"skill|chat","skill_name"}
  data: {"type":"content","content":"..."}
  data: {"type":"error","error":"..."}
  data: [DONE]
  # 预留: {"type":"ask", ...} 确认卡片（未实现）
```

编排：

1. 校验项目 / 会话。
2. 有 `skill_name` → `mode=skill`；否则 Router（仅 `disable_model_invocation=false` 的 skill）→ `skill` / `chat` / `clarify`（clarify 展示并入 chat）。
3. 组装对应 prompt → 预算截断 → 流式 → 落盘；必要时刷新 `summary`；写 `runs/{run_id}.json`。

**Router 策略**：完全尊重 `disable-model-invocation`；内置 quick_action 默认不可自动选。

---

## 6. 前端接线

- `api/generate.js`：SSE 解析（含 `router_meta`）+ signal；`api/sessions.js`：CRUD。
- 自由输入不传 `skill_name`；按钮 / `/name` 传明确 skill。
- `useAgentGenerate`：`mode=chat` 不写 `aiDraft`；`mode=skill` 维持草稿卡。

---

## 7. 与验收的衔接

- 按钮「续写」→ 跳过 Router → 流式气泡 + 草稿卡 → 插入文末。
- 自由闲聊 → Router → chat 气泡，不进草稿。
- 自定义 skill 将 `disable-model-invocation` 设为 `false` 后，自然语言可被 Router 选中。
