# 轻量通用 Agent 开发方向

> 状态：**本期 L1 已落地**；**Agent Viewer 已落地**（见 [`docs/build/08-AgentViewer.md`](build/08-AgentViewer.md)、[`docs/build/07-轻量Agent闲聊与Router.md`](build/07-轻量Agent闲聊与Router.md)、[`docs/build/06-Agent生成与会话链路.md`](build/06-Agent生成与会话链路.md)）  
> 相关：[`docs/记忆规则与提示词组装.md`](记忆规则与提示词组装.md)  
> 相关代码：`prompt_builder`、`generation_service`、`session_store`、`context_budget`、`run_store`、`skill_loader`、`routers/agent_viewer.py`；前端 `components/editor/Agent/`、`pages/AgentViewerPage.jsx`

**标记约定**

| 标记 | 含义 |
| --- | --- |
| `【已完成】` | 本期已实现并合入代码 |
| `【本期】` | 原本期范围（现多已完成；未勾项见下表） |
| `【后续】` | 排到 P2 / P3，未做 |
| `【不做】` | 明确排除 |

本期范围一句话（已完成）：**闲聊 + 摘要截断 + Router 自动选 skill + 上下文分流 + run 落盘 + Agent Viewer**；确认卡 / 工具 / Top-K 记忆仍属后续。

**Router 策略（已拍板并已实现）**：完全尊重 `disable-model-invocation`。仅字段为 `false` 的 skill 可被自动选；内置四个 quick_action 保持 `true`（按钮 / `/name`）；用户自定义可在设置中打开自动选。失败或无可选 skill → `chat`。

### 完成清单（速览）

| 项 | 状态 |
| --- | --- |
| P0：会话 `summary` + 历史截断 + 无 skill 闲聊 | `【已完成】` |
| P0.5：`run_store` 最小落盘 | `【已完成】` |
| P1：Router + skill/chat 分流加载 | `【已完成】` |
| 粗粒度 `context_budget` | `【已完成】` |
| 前端：自由输入不默认续写；chat 不进 `aiDraft` | `【已完成】` |
| Agent Viewer UI | `【已完成】` |
| `ask` / 白名单工具 | `【后续】` P2 |
| 记忆 Top-K / 章摘要预计算 | `【后续】` P3 |

---

## 0. 一句话结论

轻量通用 Agent **可以做**，且应做成「写小说的上下文形态」，而不是照搬 IDE Agent。

核心不是堆更多模型能力，而是：

**默认少塞 → 按 skill / 工具按需加厚 → 对话靠摘要 → 关键写入靠确认卡。**

落地顺序：`P0 → P1` 与 Viewer 已完成；下一步为 `P2`（`ask`/工具）。先不要上 LangGraph、多 Agent 或通用 tool loop。

---

## 1. 目标与非目标

### 1.1 要做成什么样

在编辑页 Agent 栏里，用户可以：

1. `【已完成】` **少点按钮**：自然语言输入后，系统自动判断该走某个可自动调用的 skill、闲聊，还是先澄清。
2. `【后续】` **关键操作可确认**：写入设定、选定剧情分支、采用大段改写前，弹出确认卡片（`ask`）。
3. `【后续】` **按需读项目**：少量小说专用工具拉取章节 / 记忆 / 大纲，而不是每轮全量注入。

产品气质仍然是「小说写作助手」，不是「半个 Cursor」。

### 1.2 能力分层（只做前两层）

| 层 | 能力 | 写小说价值 | 标记 |
| --- | --- | --- | --- |
| **L1** | 自动选 skill + 多轮闲聊 | 高：少点按钮 | `【已完成】` |
| **L2** | 确认卡片（`ask`）+ 少量白名单工具 | 高：定调、选分支、写入设定前确认 | `【后续】` |
| **L3** | 任意工具 / 多步规划 / 浏览器 / shell | 低：成本与复杂度陡增 | `【不做】` |

### 1.3 明确不做 `【不做】`

- 通用 shell、任意文件树、浏览器自动化。
- 开放式 ReAct / 无限 tool 循环。
- 一上来 LangGraph、多 Agent 分工框架。
- 每轮把「完整 system + user 历史 prompt」原样累加。
- 「近 3 章全文 + 全量记忆 + 长对话」三件套常驻（skill 路径仍可能全量注入记忆/近 3 章；闲聊/Router 已薄化）。

---

## 2. 现状与痛点

### 2.1 当前怎么工作（L1 落地后）

见 `06` / `07`：

- `POST /generate` → HTTP SSE；`skill_name` **可选**（有则跳过 Router，无则自动选 / chat）。
- 显式指定：按钮或 `/name`；自由输入走 Router。
- **分流**：Router / chat 用 `build_thin_context` + history；skill 执行仍 `build_from_project`（全量模板变量）+ 极短 `conversation_note`。
- 会话 `summary` + 最近 K 轮注入模型（chat / Router）；skill 路径刻意压低 history。
- SSE：`router_meta` | `meta`（含 `mode`）| `content` | `error` | `[DONE]`；`ask` 仍预留未实现。
- 每次 generate 写入 `agent/runs/{run_id}.json`；开发者页 `/dev/agent-viewer` 只读可视化。

### 2.2 直接做成「通用 Agent」会炸在哪里

若在 skill 全量注入之上，再叠加多轮 history、Router、工具返回，上下文会迅速膨胀。  
因此 **「怎么压上下文」比「怎么加 Agent 能力」更优先**——本期已用分流 + 摘要 + 预算起步；P2/P3 继续按需拉取与 Top-K。

---

## 3. 上下文策略（主方案）

### 3.1 分层上下文

```text
L0 常驻（短）     书名/题材、全局规则摘要、当前章标题 + 末尾 N 字
L1 按需拉取       某个人物卡片、某一章、某卷纲（工具或检索）
L2 本轮对话       最近 K 轮摘要 + 当前 user
L3 Skill 正文     选中 skill 后才展开完整模板变量
```

原则：**默认薄，需要时再厚。**

| 调用类型 | 建议装载 | 标记 |
| --- | --- | --- |
| Router（自动选 skill） | 仅 L0 + L2 + skill 的 `name/description` 列表 | `【已完成】` |
| 纯闲聊 | L0 + L2（项目上下文保持薄） | `【已完成】` |
| 执行 skill（续写/润色等） | 现有全量模板变量 + 极短对话摘要（`conversation_note`） | `【已完成】`（章末/Top-K 未改） |
| 工具补充后再生 | 在本轮 messages 中追加工具结果，再生成；仍受预算约束 | `【后续】` |

### 3.2 压缩手段（按性价比）

#### ① 滑动窗口 + 对话摘要（收益最大）`【已完成】`

- 会话超过 N 轮：旧轮压成 `summary` 写入 session。
- 模型只看：摘要 + 最近 3 轮原文（常量见实现）。
- 摘要失败时截断拼接兜底。

#### ② 章节不要整章常驻 `【后续】`

- **续写默认**：当前章末 2k～4k 字 +「前序章一句话摘要」（可预计算进 `outline` / 章 meta）。
- 今日「最近 3 章全文」改为工具 `read_chapter`：模型需要对比前文时再拉。
- 润色 / 扩写：以 `$selected_text` 或当前段为主，不必带三章全文。
- **本期小步**：闲聊/Router 的 L0 已用当前章末窗口；skill 路径仍可带近 3 章全文。

#### ③ 记忆按相关性注入 `【后续】`（P3）

- 不要每次 dump 全部 `characters` / `worldview`。
- MVP 可用：关键词 + 当前章出现的人名 → Top-K 条目；其余走 `search_memory`。
- 向量库放到更后期；简单匹配先够用。

#### ④ Skill 分流加载 `【已完成】`

- **Router 调用**：只给可自动调用 skill 的 `name + description`。
- **执行调用**：再 `build_from_project` 拼完整 prompt。
- 禁止「选 skill 的那一跳」就带上三章正文与全量记忆。

#### ⑤ 确认卡片打断时冻结上下文 `【后续】`（随 `ask`）

- `ask` 暂停时，把本轮已组装的 **prompt 指纹 / `run_id`** 挂在 session（`waiting_user`）。
- 用户选完只追加答案再 continue，不必整包重算（除非章节/记忆在等待期间已改）。

#### ⑥ 预算会计 `【已完成】`（粗估；数据写入 run，Viewer 可验收）

用设置里已有的 `context_window` 做硬预算：

```text
system + history + tool_results + skill_body  ≤  0.7 × context_window
```

实现：`context_budget.py`（字符/2 估算）。本期砍序以对话侧（history / `conversation_note`）为主；skill 模板正文受保护。

---

## 4. 运行时设计（适合 SSE，不必上 WS）

与 `06` 文档一致：多轮 HTTP + SSE 事件类型即可。

```text
用户输入
  → (可选) Router：skill / chat / clarify
  → 若需确认 → SSE type=ask → 本轮结束（session=waiting_user）   # 后续
  → 用户选项 → POST continue / 再次 generate                   # 后续
  → 执行 skill 或 chat（工具 1～2 跳：后续）
  → SSE content… → [DONE]
```

### 4.1 自动选 skill（Router）`【已完成】`

- 一次**短** structured JSON：`skill | chat | clarify`（附 reason）。
- 输入仅 L0 + L2 + 可自动调用 skill 目录。
- 失败降级：走 chat；UI 保留按钮与 `/name`。
- 完全尊重 `disable-model-invocation`；内置续写等默认不可自动选。
- SSE：`router_meta` 供前端轻提示。

### 4.2 工具（白名单、小说专用、少步骤）`【后续】`

建议首批：

| 工具 | 读写 | 用途 |
| --- | --- | --- |
| `read_chapter` | 读 | 按章拉取正文（可带 offset/limit） |
| `get_outline` | 读 | 卷纲 / 章列表 / 章摘要 |
| `search_memory` | 读 | 按关键词检索人物/世界观/故事内核 |
| `propose_memory_write` | 提议写 | 生成待写入草案，**必须经 ask 确认**后才落 `memory.json` |

约束：

- 同步执行，最多 **1～2 跳**，结果写入本轮 messages 再生成。
- 不做开放式多步规划；超步数则 clarify 或交还用户。

### 4.3 确认卡片（`ask`）`【后续】`

优先场景（比通用 tool approval 更贴小说）：

1. **写入记忆**（人物/世界观/故事内核）
2. **选定剧情分支**（A/B/C 定调）
3. **采用大段改写**（润色/扩写结果是否替换选区）

传输仍用现有预留：

```text
SSE: {"type":"ask", "ask_id", "title", "options":[...], ...}
session 标记 waiting_user + 冻结 run 上下文
用户选择 → continue → 继续 content 或落盘
```

---

## 5. 与「写小说为主」对齐的产品规则

| 场景 | 上下文策略 | 结果去向 | 标记 |
| --- | --- | --- | --- |
| 明确 skill（按钮 / `/` / Router 选中） | **以 skill 模板为主**；chat history 只带极短摘要 | 续写/润色类可进 `aiDraft`；设定类确认入库属后续 | `【已完成】`（draft 分流） |
| 纯闲聊 | history 为主 + **薄**项目上下文（L0） | 默认**不进** `aiDraft`，只留在会话气泡 | `【已完成】` |
| 工具写设定 | 必须 `ask` 确认 | 确认后写 `memory.json` | `【后续】` |
| Router | 尊重 `disable-model-invocation` | 不可自动选的 skill 仍靠按钮/`/` | `【已完成】` |

可复现性要求：同一章、同一 skill、相近输入，续写结果不应因「闲聊历史很长」而漂到不可控；故 skill 执行路径刻意压低 history 权重（`conversation_note` ≤ 约 500 字）。

---

## 6. 模块演进建议（相对现状）

| 模块 | 落地情况 | 后续 | 标记 |
| --- | --- | --- | --- |
| `prompt_builder` | 已有 `build_thin_context` / history / router / chat；skill 仍 `build_from_project` | Top-K / 章末按需 | 分流 `【已完成】`；Top-K `【后续】` |
| `generation_service` | mode：`router` / `chat` / `skill` | `continue_ask`、工具环 | `【已完成】` / 后置 `【后续】` |
| `session_store` | `summary`、`summary_at_round_count` | `waiting_user` / `pending_run` | summary `【已完成】` |
| `skill_loader` | Router 用 `include_auto_invocable_only` | — | `【已完成】` |
| `context_budget` | 按 `context_window` 截断与记账，写入 run | 更精细 tokenizer | `【已完成】` |
| 只读/提议工具 | 无 | 薄封装 store | `【后续】` |
| 前端 Agent | 自由输入省略 `skill_name`；chat 不进 draft；`router_meta` 轻提示 | `ask` 卡片 | 分流 `【已完成】` |
| `run_store` | `agent/runs/{run_id}.json`；list/get | — | 挂点 + 调试 API `【已完成】` |
| `agent-viewer` | `/dev/agent-viewer` 只读可视化；按次 skill/工具 | P2 填 `tools[]` | `【已完成】` |

观测（已落盘并由 Viewer 展示）：

- 每轮记录：mode、选用 skill、各段字符估算、是否截断、耗时。
- Router / 执行 /（若触发）摘要分 `steps`；每步带 `tools[]`（本期空）与 skill 元数据。

---

## 7. 落地阶段

| 阶段 | 内容 | 验收直觉 | 标记 |
| --- | --- | --- | --- |
| **P0** | 会话摘要 + 历史截断 + 无 skill 闲聊 | 多轮闲聊不爆窗；不点按钮也能对话 | `【已完成】` |
| **P0.5** | 最小 run 落盘（无 UI） | `agent/runs/` 有 JSON | `【已完成】` |
| **P0.5b** | Agent Viewer 开发者可视化页 | 打开链接看 prompt / 回复 / token / 剩余% / 每步 skill·工具 | `【已完成】` |
| **P1** | Router + skill/chat 分流 | 可自动 skill 能被自然语言选中；闲聊走 chat；内置续写靠按钮/`/` | `【已完成】` |
| **P2** | `ask` + 2～4 个只读/提议工具 | 写入人物前必须确认；需要时再读某章 | `【后续】` |
| **P3** | 记忆 Top-K / 章摘要预计算 /（可选）向量 | 长篇续写仍稳、费用可控 | `【后续】` |

### 性价比最高的三件事（均已完成）

1. **分层上下文（默认薄）** `【已完成】`
2. **对话摘要** `【已完成】`
3. **Router 与执行两次调用、上下文分量不同** `【已完成】`

另加观测挂点：**最小 run 落盘** `【已完成】`；**Agent Viewer UI** 见 §7.1。

### 7.1 Agent Viewer `【已完成】`

`data/projects/{id}/agent/runs/{run_id}.json` 落盘（Router / 执行 / 摘要分 step）。开发者页 `/dev/agent-viewer` 经 `GET /api/dev/projects/{id}/agent/runs` 只读拉取；入口只在 `npm run start` 终端打印，不进产品导航。

能力：运行列表、完整 prompt/回复、token 估算、剩余上下文%、mode / skill / 截断；**每次模型调用**展示 skill（kind、来源）、Router 候选 skill、`tools[]`（P2 接入后直接显示）。架构见 [`docs/build/08-AgentViewer.md`](build/08-AgentViewer.md)。

### 建议不提前做的事

- 不要在未稳定前并行上工具循环 / 向量库。
- 任何阶段都不要为了「更像 Cursor」引入通用 shell。

---

## 8. 与现有契约的衔接

已在 generate SSE 上扩展（详见 `06`）：

```text
# 请求（已实现）
POST /api/projects/{id}/generate
{
  session_id,
  skill_name?,          # 有则跳过 Router；无则自动选 / chat
  user_input?,
  chapter_id?, current_content?, selected_text?,
  chapter_rules?,
  model?
  # 后续预留：ask_reply
}

# SSE（已实现 / 预留）
router_meta   # 【已完成】decision / skill_name / reason
meta          # 【已完成】含 mode: skill|chat
content | error | [DONE]
ask           # 【后续】确认卡片
```

会话文件：

```json
{
  "id": "sess_...",
  "summary": "……",
  "summary_at_round_count": 0,
  "status": "idle | generating",
  "messages": [ ]
}
```

`waiting_user` / `pending_run`：`【后续】`（随 `ask`）；本期不落这些键。

---

## 9. 风险与取舍

| 风险 | 缓解 | 备注 |
| --- | --- | --- |
| Router 选错 skill | 降级 chat；UI 保留按钮与 `/` | 已按此实现 |
| 摘要丢失关键约束 | 摘要 prompt 强制保留定调/否决点 | 已写入摘要 system |
| 章末窗口导致前后矛盾 | `read_chapter` + 前序一句话摘要；Top-K | `【后续】` |
| 确认卡打断后章节被用户改过 | fingerprint / mtime | `【后续】` |
| 成本（多一次 Router 调用） | 短上下文 + 小 max_tokens | 已按此实现 |

---

## 10. 下一步

### 本期（已完成）

1. ~~冻结边界：L1 + run 落盘；L2 与 Viewer 后置。~~ `【已完成】`
2. ~~P0：`summary` + 闲聊 + 历史截断。~~ `【已完成】`
3. ~~P0.5：`run_store` 最小落盘。~~ `【已完成】`
4. ~~P1：Router + 分流；尊重 `disable-model-invocation`。~~ `【已完成】`
5. ~~Agent Viewer 开发者页。~~ `【已完成】`（见 §7.1 / `08-AgentViewer.md`）

### 后续

6. **P2** `【后续】`：与设定库写入、草稿「采用」一起做 `ask` + 白名单工具。
7. **P3** `【后续】`：记忆 Top-K / 章摘要预计算 /（可选）向量检索；skill 路径进一步去掉「近 3 章常驻」。

---

## 附录 A：和 IDE Agent 的差异（刻意为之）

| 维度 | IDE Agent（如 Cursor） | 本项目轻量小说 Agent |
| --- | --- | --- |
| 主产物 | 补丁 / 命令 / 多文件编辑 | 章节正文、设定卡片、剧情选择 |
| 工具面 | 广（读写工作区、终端） | 窄（章、纲、记忆） |
| 上下文 | 代码检索 + 打开文件 | 分层书上下文 + skill 模板 |
| 确认 | tool approval 偏执行风险 | `ask` 偏叙事/设定决策 |
| 历史 | 长对话常有价值 | skill 路径应压历史，保证续写可复现 |

---

## 附录 B：反模式清单

1. 每轮累加完整历史 prompt。
2. Router 与执行共用同一份「三章 + 全记忆」巨包。
3. 未确认就写入 `memory.json`。
4. 为闲聊结果默认塞进 `aiDraft`。
5. 引入通用 Agent 框架后再裁剪——应反过来：先薄运行时，不够再加。
