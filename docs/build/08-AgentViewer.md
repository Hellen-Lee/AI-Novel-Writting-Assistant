# Agent Viewer（开发者观测页）

> 对应方向：[`docs/轻量通用Agent开发方向.md`](../轻量通用Agent开发方向.md) §7.1  
> 前置：[`06-Agent生成与会话链路.md`](06-Agent生成与会话链路.md)、[`07-轻量Agent闲聊与Router.md`](07-轻量Agent闲聊与Router.md)  
> 代码：`run_store`、`routers/agent_viewer.py`、`generation_service`；前端 `pages/AgentViewerPage.jsx`、`components/agent-viewer/`、`api/agentViewer.js`

本文记为何做成独立观测页、一次模型调用如何落盘、以及 tools 槽位给 P2；**不是**字段说明书。

---

## 1. 目标边界

| 做 | 不做 |
| --- | --- |
| 只读 `agent/runs/{run_id}.json` | 改写 run、重放生成、产品导航入口 |
| 列表按**会话**聚合；一轮 = 用户消息 + Agent 回复（同一框） | `ask` 确认卡、白名单工具执行 |
| 框内展开 Router / Skill / 闲聊 / 摘要的 prompt、预算、工具 | 开放式 tool loop |

入口：`npm run start` 终端打印 `http://localhost:5173/dev/agent-viewer`（`start:prod` 为 4173）。产品页（首页 / 设置 / 编辑）不加链接。

---

## 2. 为何独立页、不进产品壳

观测是给开发者看「这一轮到底塞了什么、选了哪个 skill、会不会爆窗」的账本，不是写作流程的一环。塞进编辑页 Agent 栏会和对话抢宽度，也会让作者误点到 prompt 全文。

同 Vite、同端口、不同 path：不必第二套 HMR / CORS。终端已有 `link()`，多打一行即可点开。

---

## 3. 落盘仍按 run；Viewer 按会话读

`POST /generate` 仍落一条 `run_*.json`（一次用户发送 = 一轮对话）。`steps[]` 里**每一步对应一次模型调用**：

```text
（可选）router     自动选 skill / chat / clarify；记下 candidate_skills
         skill|chat 执行生成  ← 该步 response 即用户看见的 Agent 回复
（可选）summary    会话摘要压缩（写入 session.summary，不进气泡）
```

每步固定带：`mode`、`skill_name` / `skill_kind` / `skill_source`、`candidate_skills`、`tools[]`、`system` / `user` / `response`、`chars_est`、`budget_report`、`latency_ms`。

`tools` 本期恒为 `[]`。P2 白名单工具接入后，把 `{name, args?, result_preview?}` 推进该数组，Viewer 无需改契约即可显示。旧 JSON 缺字段时按空数组读。

观测页不按 run 平铺，而按 `session_id` 聚合：

```text
会话 A
  第 1 轮  【用户输入】+ prompt_builder 组装的 system/user + Agent 回复
            Router → Skill/闲聊 →（可选）摘要
  第 2 轮  …
会话 B
  …
```

HTTP：`/api/dev/projects/{id}/agent/runs` 列表无 prompt 正文（含 `user_input` / `response_preview`）；`/sessions/{sid}/runs` 与 `/runs/{run_id}` 才返回全文。

---

## 4. 模块职责

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 落盘 | `run_store` | `make_step` / `save_run` / `list_runs` / `get_run` / `list_runs_for_session` |
| 编排 | `generation_service` | 每跳模型调用写一步；摘要并入同一次 save |
| HTTP | `routers/agent_viewer.py` | 只读 list / 单 run / 某会话全部 run |
| 页 | `AgentViewerPage` | 选项目、按会话编排 |
| UI | `SessionList` / `SessionDetail` / `TurnCard` / `ModelCall` | 会话列表（名 + 上下文摘要）+ 一轮大框（用户输入与组装 prompt / Agent 回复）+ 嵌套调用 |

前端路由挂在 `App.jsx` 的 `/dev/agent-viewer`，在 catch-all 之前；不出现在 `AppHeader` / 设置侧栏。
