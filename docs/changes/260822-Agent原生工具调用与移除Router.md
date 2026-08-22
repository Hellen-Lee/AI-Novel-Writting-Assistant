# 260822 · Agent 原生工具调用与移除 Router

> 架构笔记：`docs/build/09-Agent原生工具调用.md`（本迭代取代 `06`/`07` 描述的 Router 链路）  
> 代码：`backend/app/services/{model_client,agent_tools,prompt_builder,generation_service}.py`、`models/schemas.py`；前端 `components/editor/Agent/hook/{useAgentGenerate,useAgentPanel}.js`、`components/agent-viewer/{format,pipeline,ModelCall}.jsx`  
> 说明：本文为迭代过程记录；契约与编排见 build 文档。

---

## 1. 目标

- 生成链路从「线性单轮 + Router 分流 + 全量上下文预塞」改为 **agentic 原生 function-calling**：模型自行决定是否通过工具读取 章节/前文/大纲/记忆。
- prompt 只打包 system + 规则 + 薄 user；不再预塞重上下文。
- 去掉 Router 对续写/闲聊的显式分类，路由隐式化。
- skill 按钮 / 斜杠命令保留为「预设」，只注入意图文本，仍走统一 agentic 路径。
- draft vs 气泡复用既有 `aiDraft` 组件，判定信号化为 `meta.draft`。

---

## 2. IA 变更

| 之前 | 之后 |
| --- | --- |
| `meta.mode`: `router \| skill \| chat`；SSE `router_meta` | `meta.mode` 恒 `agent`；`meta.draft:bool`；`tool_progress` |
| 自由输入 → Router 分流 | 自由文本与预设统一 agentic 路径 |
| `build_from_project` 全量上下文 | `build_rules_block` + `build_thin_user` 薄上下文 |
| draft 判定 `meta.mode==='skill'` | `_decide_draft` → `meta.draft` |
| `model_client` 无 tools | `chat` / `chat_stream` 支持 tools + 聚合 |

---

## 3. 文件改动

| 文件 | 改动 |
| --- | --- |
| `model_client.py` | 新增 `chat`/`chat_stream`/`_iter_chat_deltas`/`aggregate_tool_calls`/`message_has_tool_calls` |
| `agent_tools.py`（新建） | 四个只读工具 + 字符截断 + `execute_tool` |
| `prompt_builder.py` | `build_rules_block`/`build_thin_user`/`preset_intent` |
| `generation_service.py` | `iter_generate` 改 agentic 循环；删 Router；`_decide_draft`；双 `meta` |
| `schemas.py` | `skill_name` 语义重标为预设 |
| `useAgentGenerate.js` | `meta.draft` 驱动 aiDraft；移除 `router_meta` |
| `useAgentPanel.js` / `generate.js` | 注释更新 |
| `agent-viewer/{format,pipeline,ModelCall}.jsx` | `agent`/`agent_tool` 模式渲染（工具名+参数） |

---

## 4. 排障记录

- **缺最终 `meta.draft`**：最初 `_decide_draft` 在最终流式前执行，`content` 为空导致 `reads_work and content.strip()` 恒假。改为：`reads_work` 作为独立充分信号 + 判定挪到流式结束后。
- **长正文自由文本误判为气泡**：首次无工具的 `chat` 也会 append `agent_tool` step，使 `bool(tool_steps)` 恒真，压死长度启发。改为独立的 `tool_called` 标志，仅在工具实际执行时置真。
- **测试脚本**：`create_project` 用 kwargs（自生成 id）；取 `proj["meta"]["id"]`；帧解析循环修正。

---

## 5. 验证清单

- [ ] 续写指令 → `meta{mode:agent,draft:true}`、可选 `tool_progress`、`content` 分块、`[DONE]`
- [ ] 讨论指令 → `draft:false`、短气泡、不调 `read_chapter`
- [ ] 预设续写按钮 → `meta.preset=续写`、`draft:true`、run JSON 出现 `read_recent_work`/`read_chapter` 工具 step
- [ ] Agent Viewer 打开该 run → 出现 `agent_tool` 步骤（工具名+参数）与最终 `agent` 步骤正文
- [ ] draft 轮 `pending=true`（插入/弃用卡）；气泡轮 `pending=false`
- [ ] ≥6 轮后仍出现 `summary` step（摘要路径不变）
- [ ] 设置页连接测试（`generate`/`generate_stream` 回归）

> 说明：工具循环、四类路由、`aggregate_tool_calls` 已用 mock 客户端验证；真实 provider 的端到端 SSE 冒烟待有可用 API key / 运行中的服务后补验。
