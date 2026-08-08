# Agent 生成与会话链路

> 对应计划：`docs/AI小说创作Agent_MVP开发计划.md` §5.0（链路）→ §5.1（续写验收）  
> 设计稿：编辑页 Agent 栏（`d7ubn`）/ 历史壳（`OckRz`）  
> 代码：`backend/app/services/{session_store,generation_service}.py`、`routers/{sessions,generation}.py`、`api_catalog.py`；前端 `api/{generate,sessions}.js`、`components/editor/Agent/`

本文记录传输层、会话落盘与模块职责取舍；**不是**接口字段说明书。

---

## 1. 目标边界

| 做 | 不做（本期 / MVP） |
| --- | --- |
| `POST .../generate` HTTP SSE 流式生成 | 全双工 WebSocket |
| 按项目落盘多会话；列表 / 新建 / 切换 / 删除 | 历史搜索、按日分组、重命名 |
| 生成请求带 `session_id`；服务端追加消息 | 将会话全文当 chat history 注入模型 |
| 前端流式写气泡 + `aiDraft`；Abort 中断 | 模型自动选 skill；tool / function calling |
| `api_catalog.py` 集中注册并索引全部 API | 确认卡片 `ask` 事件（契约预留，不实现） |

---

## 2. 为何 SSE 而非 WebSocket

小说 Agent 主路径是「一次技能调用 → 单向流式正文」，不是 IDE 式双向 tool loop。后端已有 `model_client.iter_sse`，前端可用 `fetch` + `AbortController`。

后续若做 Cursor 式确认卡片：仍用**多轮 HTTP**——本轮 SSE 以 `type: ask` 结束并标记会话 `waiting_user`，用户选择后再 `POST /generate`（或 `/continue`）继续流。不必先上 WS。

---

## 3. 会话落盘

```
data/projects/{project_id}/agent/
  sessions.json                 # 索引：id, title, updatedAt, messageCount
  sessions/{session_id}.json    # 完整 messages[]
```

- `session_id` 由服务端生成（`sess_...`）。
- 切换会话：前端改 `activeSessionId` 并拉取详情；若正在生成则**先 abort**。
- 历史消息仅供人回看与重试锚定；MVP 模型上下文仍来自 skill 模板 + 章节 / 记忆 / 规则（`prompt_builder`）。

---

## 4. 模块职责

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 索引 | `backend/app/api_catalog.py` | 罗列 METHOD + path；`include_router` 唯一挂载点 |
| 入口 | `main.py` | 调 `register_routers(app)` |
| HTTP | `routers/sessions.py`、`routers/generation.py` | 薄校验与 StreamingResponse |
| 业务 | `session_store.py`、`generation_service.py` | 落盘、编排 prompt → 模型 → 写会话 |
| 复用 | `prompt_builder`、`model_client`、`skill_loader` | 不变 |

单文件控制在 800 行以内；handlers 不集中进一个巨型文件。

---

## 5. 生成契约摘要

```text
POST /api/projects/{project_id}/generate
Body: session_id, skill_name,
      chapter_id?, current_content?, selected_text?, user_input?,
      chapter_rules?, model?

SSE:
  data: {"type":"meta","session_id","user_message_id","assistant_message_id",...}
  data: {"type":"content","content":"..."}   # 亦兼容仅有 content 键
  data: {"type":"error","error":"..."}
  data: [DONE]
  # 预留: {"type":"ask", ...} 确认卡片（未实现）
```

编排：校验项目 / 会话 / skill → `build_from_project` → 追加 user + assistant(pending) → `iter` 推送并攒全文 → finalize / error。

---

## 6. 前端接线

- `api/generate.js`：SSE 解析 + signal；`api/sessions.js`：CRUD。
- `service/generate.js` → 真实 API；`useAgentGenerate` 增量写 message 与 `setAiDraft`。
- `useAgentSessions` 接 REST；`EditorPage` 传入 `chapterId` / `content` / `setAiDraft`。

---

## 7. 与 §5 验收的衔接

第一条联调路径：编辑页点「续写」→ 流式气泡 + 草稿卡「生成中」→ 完成后「插入文末」写入章节 → 保存。

自动选 skill、确认卡片、引导页一键生成可复用同一 `generate`，列为后续。
