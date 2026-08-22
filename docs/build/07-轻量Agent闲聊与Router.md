# 轻量 Agent：闲聊、摘要与 Router

> ⚠️ **已废弃**：Router 分流与全量上下文预塞已被 [`09-Agent原生工具调用.md`](09-Agent原生工具调用.md) 取代——现为统一 agentic function-calling 路径。本文仅作历史留档。
>
> 对应方向：[`docs/轻量通用Agent开发方向.md`](../轻量通用Agent开发方向.md) 本期 L1  
> 前置：[`06-Agent生成与会话链路.md`](06-Agent生成与会话链路.md)  
> 代码：`prompt_builder`、`generation_service`、`session_store`、`context_budget`、`run_store`；前端 `components/editor/Agent/`

本文记本期为何分流、模块职责与后续挂点；**不是**字段说明书。

---

## 1. 本期边界

| 做 | 不做 |
| --- | --- |
| 无 `skill_name` → Router → `chat` / 可自动调用的 skill | 不自动选 `disable-model-invocation=true` 的 skill |
| 会话 `summary` + 最近 K 轮注入模型 | `ask` 确认卡、白名单工具 |
| skill / chat 上下文分流；粗粒度预算截断 | Top-K 记忆、近 3 章改工具拉取 |
| `agent/runs/{run_id}.json` 最小落盘 | 开放式 tool loop |

**Router 策略**：完全尊重 `disable-model-invocation`。仅 `false` 进入候选；内置四个 quick_action 默认 `true`，靠按钮 / `/name`。

---

## 2. 为何分流

- Router 若带「三章 + 全记忆」会又贵又噪，且与「选哪个 skill」无关。
- 闲聊需要 history；续写类 skill 应以模板变量为主，history 只留极短 `conversation_note`，避免续写被闲聊带偏。
- 默认薄、执行时再厚，比一上来上工具环更贴小说场景。

---

## 3. 模块职责

| 模块 | 职责 |
| --- | --- |
| `prompt_builder` | `build_thin_context` / `build_history_block` / `build_router_prompt` / `build_chat_prompt`；skill 仍走 `build_from_project` |
| `generation_service` | 编排 mode：`router` → `chat` \| `skill`；SSE `router_meta` + `meta.mode` |
| `session_store` | `summary` 字段；摘要压缩触发 |
| `context_budget` | `0.7 × context_window` 字符粗估；砍对话侧 |
| `run_store` | 每次 generate 落盘 steps，供 Agent Viewer |
| 前端 Agent | 自由输入不传 `skill_name`；`chat` 不进 `aiDraft` |

---

## 4. 后续口子（本期不写死实现）

- 会话：`status: waiting_user`、`pending_run`（随 `ask`）。
- 请求：`ask_reply`；SSE：`type: ask`。
- 工具：在执行 path 上插 1～2 跳，结果进本轮 messages，仍受预算约束。

Viewer 已落地：`/dev/agent-viewer` 只读 `agent/runs/`（经 `/api/dev/...`）；见 [`08-AgentViewer.md`](08-AgentViewer.md)。
