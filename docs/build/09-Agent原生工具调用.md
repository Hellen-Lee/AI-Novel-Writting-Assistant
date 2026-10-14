# Agent 原生工具调用（统一 agentic 路径）

> 前置：[`06-Agent生成与会话链路.md`](06-Agent生成与会话链路.md)、[`07-轻量Agent闲聊与Router.md`](07-轻量Agent闲聊与Router.md)（两者描述的是**已移除**的 Router 架构，本文件为其替代）  
> 代码：`backend/app/services/{model_client,agent_tools,prompt_builder,generation_service}.py`、`models/schemas.py`；前端 `components/editor/Agent/hook/{useAgentGenerate,useAgentPanel}.js`、`components/agent-viewer/{format,pipeline,ModelCall}.jsx`  
> 迭代记录：`docs/changes/260822-Agent原生工具调用与移除Router.md`

本文记录 Agent 生成链路为何从「线性单轮 + Router 分流 + 全量上下文预塞」改为「agentic 原生 function-calling + 统一路径」；**不是**字段说明书。

---

## 1. 目标边界

| 做 | 不做 / 另案 |
| --- | --- |
| 原生 OpenAI function-calling（`tools` / `tool_calls`） | 白名单之外的写工具；写正文仍走前端 `aiDraft` |
| 模型自行决定是否读 章节/前文/大纲/记忆 | 全量上下文预塞进 prompt |
| 统一 agentic 路径：预设（skill 按钮/斜杠）与自由文本同一执行链 | Router 对「续写 vs 闲聊」的分类 |
| 只读工具 + 每结果字符截断 + `MAX_TOOL_ROUNDS` 兜底 | 开放式、无上限的 tool loop |
| `draft:bool` 驱动前端 aiDraft 卡（复用既有组件） | 新增正文写入工具 |
| 模型不支持 tools 时优雅退化为薄上下文单轮 | 依赖 `finish_reason` 判续写/闲聊 |

---

## 2. 为何改

旧架构是**线性单轮**流水线：自由输入先进 Router（分类 `skill/chat/clarify`），再按 `build_from_project` 把**全量上下文**（memory、outline、前三章全文、章末窗口）塞进 prompt，然后执行 skill 或闲聊。模型完全是 text-in/text-out，没有工具能力——「模型自己决定读什么」做不到，只能靠预塞 + Router 分流。

问题：
- 上下文又贵又噪：与「本次要写什么」无关的大段设定/前文总是占满预算。
- 续写 vs 闲聊依赖 Router 显式分类，模型无自主权；「完成结尾」这种无「写」字的指令无法准确归入续写。
- 后续加工具（如读某章、检索记忆）需要改分流逻辑，扩展性差。

改为 agentic 原生 function-calling：**prompt 只打包 system + 规则 + 薄 user**，模型在需要时通过工具自取上下文；路由隐式化——模型根据用户提示词自行决定写正文（调读前文工具 + 输出长正文）还是闲聊（不调工具 + 简洁回复）。

---

## 3. 模块职责

| 模块 | 职责 |
| --- | --- |
| `model_client` | `chat` / `chat_stream_tools`（tools 进 payload、解析 `delta.reasoning_content` / `delta.tool_calls`）、`aggregate_tool_calls`、`message_has_tool_calls`；原 `chat`/`generate`/`generate_stream` 保留（回退、摘要、连接测试） |
| `agent_tools` | 工具注册表 `TOOLS` + `TOOL_FUNCTIONS` + `execute_tool`；四个只读工具与字符截断 |
| `prompt_builder` | 薄构建 `build_rules_block` / `build_thin_user`；`preset_intent` 读 skill `system` frontmatter 当意图 |
| `generation_service` | `iter_generate` 跑 agentic 循环 → 最终流式；删 Router；`_decide_draft` 路由 |
| `schemas.py` | `skill_name` 语义重标为「预设」 |

工具（全部只读，写正文复用前端 aiDraft）：

| 工具 | 作用 |
| --- | --- |
| `read_chapter(chapter_id, offset?, limit?)` | 读指定章正文（含标题/字数），按 offset/limit 切 |
| `read_recent_work(n=3)` | 读最近 n 章正文（续写前取前文） |
| `get_outline()` | 全书概要 + 分卷 + 章节列表 |
| `search_memory(category?, keyword)` | 按关键词检索记忆（世界观/人物/故事内核） |

---

## 4. 生成契约与编排

```text
POST /api/projects/{project_id}/generate
Body: session_id,
      skill_name?,          # = 预设（省略 → 统一 agentic 自由文本路径）
      chapter_id?, current_content?, selected_text?, user_input?,
      chapter_rules?, model?

SSE:
  data: {"type":"meta","session_id","user_message_id","assistant_message_id",
         "mode":"agent","skill_name","preset","draft":bool}   # 发两次：开头与定稿
  data: {"type":"tool_progress","tools":[{name,arguments}]}   # 每工具轮
  data: {"type":"thinking","text":"...","phase":"tool_round"} # 工具轮思考；
  data: {"type":"thinking","text":"..."}   # 最终正文流 reasoning；
                                           # 不进正文、不参与 draft 判定，可能穿插在 content 之间
  data: {"type":"content","content":"..."}
  data: {"type":"error","error":"..."}
  data: [DONE]
  # 已移除: {"type":"router_meta", ...}
```

编排：

1. 校验项目 / 会话；解析 `preset = skill_name or None`。
2. 组装**薄** prompt：`system = AGENT_SYSTEM`（+ preset 意图 + 项目规则）；`user = build_thin_user`。预设路径历史只留 `conversation_note`（≤500 字），自由文本路径保留最近轮次。
3. 落 user + pending 助手消息 → 发首个 `meta`（`draft` 由预设初判）。
4. **Agentic 工具循环**（`MAX_TOOL_ROUNDS=3`）：
   - `client.chat_stream_tools(system, messages, tools=TOOLS, tool_choice="auto", params={max_tokens:1024,temp:0.4})`，实时转发 reasoning；流结束后按 index 聚合分片 `tool_calls`；
   - 推理模型若返回 `reasoning_content`，仅保留在本次 turn 的内存 assistant 消息中，并在下一轮工具请求原样回传；不写入会话历史；若 stream+tools 不受网关支持，只回退一次非流式 `chat()`；
   - 记录 `agent_tool` step（**`tools` 终于被填充**，Agent Viewer 会显示工具名+参数）；
   - 无 tool_calls → 跳出；有 → `execute_tool` 逐条 append `{role:"tool",...}`，发 `tool_progress`；
   - 达轮上限 → 追加「请直接作答勿再调工具」再取一次。
5. **最终流式**：`client.chat_stream(..., tools=None)`，逐 chunk 发 `content`；推理模型的 `reasoning` delta 转发为 `thinking` 帧（不进 parts、不参与判定链路）；非推理模型无该字段，输出与此前逐字节一致。
6. 定稿：`_decide_draft` 出最终 `draft` → 再发一个 `meta`（携带解析后的 draft）→ 写助手消息（`pending = draft`）→ 摘要刷新 → `save_run` → `[DONE]`。run 的 reasoning 主 JSON 只保留预览和 sidecar 引用，完整内容写入 `agent/reasoning/{run_id}/step_{step_index}.txt.gz`，按单 step、单 run 和项目配额限制；删除会话时同步清理该会话的 runs 与 reasoning sidecar，Agent Viewer 仅允许本机访问。

### 4.1 执行层级与观测边界

一次 `iter_generate()` 是一个隐式 turn，并生成一个 `run_id`。当前不单独持久化 Turn：

```text
Session
└── 隐式 Turn（一次 POST /generate）
    └── Run（一个 run_id）
        ├── Router step（可选）
        ├── agent_tool step × N
        ├── agent step
        └── summary step（可选）
```

`step` 是一次模型调用或摘要调用；SSE `Event` 只负责增量传输；前端 `TurnCard` / `ModelCall` / `ThinkingBlock` 是观测组件，不是后端持久化对象。未来显式 Turn、重试或恢复时，使用预留的 `turn_id`、`attempt`、`parent_run_id` 扩展，不改变当前 `run_id + step_index` 的 reasoning sidecar 引用。

---

## 5. draft vs 气泡（`_decide_draft`）

不额外调模型，复用第一跳 agentic 结果：

| 判定 | 结果 |
| --- | --- |
| 预设 ∈ {续写, 润色, 扩写} | **draft**（无条件，明确写正文） |
| 预设 = 生成设定 | **bubble**（JSON 结构输出，用户阅读/复制） |
| 调用了 `read_chapter` / `read_recent_work` | **draft**（读了前文=在写正文） |
| 自由文本、无读工具、输出 > `DRAFT_PROSE_MIN_CHARS`(400) | **draft** |
| 其余 | **bubble**（闲聊） |

前端 `useAgentGenerate` 据 `meta.draft` 打开/收拢 aiDraft 卡（复用既有组件，不新增）；`pending` 由此决定。

---

## 6. 容错与兜底

- **模型不支持 function-calling**：`ModelClientError` 命中 `_tools_supported_error`（消息含 tool/function/parameter）→ 去 tools 退化为薄上下文单轮流式；配置 `enable_agent_tools`（默认 true）可整体关闭。
- **工具死循环**：`MAX_TOOL_ROUNDS=3` + 直接作答兜底。
- **流式 tool_call 解析**：arguments 分片按 index 累积 + JSON 容错（失败视为 `{}`）。
- **工具结果预算**：每工具结果按字符上限截断，保护上下文。
- **`finish_reason` 不可靠**：routing 判定不依赖它。
- **双 `meta`**：首个用于 id 映射（draft 预判），定稿 `meta` 承载最终 draft（长度启发需流式全文）。

---

## 7. 当前兼容链路与后续清理

- 当前代码仍保留自由文本的内部 Router：它会产生 `router` step，但不产生 `router_meta` SSE；后续若移除 Router，需同步调整 run 层级契约和 Agent Viewer 展示。
- 全量上下文预塞：`iter_generate` 不再走 `build_from_project` 重载路径；`build_from_project` / `build_context` 仍保留（避免破坏潜在调用），但主生成链路停用。
- 前端 `router_meta` 依赖移除；`meta.mode==='skill'` 的 draft 判定改为 `meta.draft`。
