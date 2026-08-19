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
| 列表 + 完整 prompt/回复 + 预算（token 粗估、剩余%、截断） | `ask` 确认卡、白名单工具执行 |
| 按**每次模型调用**展示 skill / 候选 skill / 工具 | 开放式 tool loop |

入口：`npm run start` 终端打印 `http://localhost:5173/dev/agent-viewer`（`start:prod` 为 4173）。产品页（首页 / 设置 / 编辑）不加链接。

---

## 2. 为何独立页、不进产品壳

观测是给开发者看「这一轮到底塞了什么、选了哪个 skill、会不会爆窗」的账本，不是写作流程的一环。塞进编辑页 Agent 栏会和对话抢宽度，也会让作者误点到 prompt 全文。

同 Vite、同端口、不同 path：不必第二套 HMR / CORS。终端已有 `link()`，多打一行即可点开。

---

## 3. 一条 run = 多次模型调用

`POST /generate` 落一条 `run_*.json`，`steps[]` 里**每一步对应一次模型调用**：

```text
（可选）router     自动选 skill / chat / clarify；记下 candidate_skills
         skill|chat 执行生成
（可选）summary    会话摘要压缩（以前不落盘，现与其它 step 一次写入）
```

每步固定带：`mode`、`skill_name` / `skill_kind` / `skill_source`、`candidate_skills`、`tools[]`、`system` / `user` / `response`、`chars_est`、`budget_report`、`latency_ms`。

`tools` 本期恒为 `[]`。P2 白名单工具接入后，把 `{name, args?, result_preview?}` 推进该数组，Viewer 无需改契约即可显示芯片。旧 JSON 缺字段时按空数组读。

HTTP 走 `/api/dev/...`，与产品 API 分开：列表不带 prompt 正文，详情才返回全文。

---

## 4. 模块职责

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 落盘 | `run_store` | `make_step` / `save_run` / `list_runs` / `get_run` |
| 编排 | `generation_service` | 每跳模型调用写一步；摘要并入同一次 save |
| HTTP | `routers/agent_viewer.py` | 只读 list / detail |
| 页 | `AgentViewerPage` | 选项目、拉列表、编排 |
| UI | `RunList` / `RunDetail` / `CallStep` | 列表与按次调用时间线 |

前端路由挂在 `App.jsx` 的 `/dev/agent-viewer`，在 catch-all 之前；不出现在 `AppHeader` / 设置侧栏。
