# frontend/AGENT.md

> 前端开发规则与约束。与根目录 `AGENTS.md` 互补；冲突时以本文件为准（前端实现细节）。

---

## 1. JSX 结构：实质块提前抽组件

- 界面 `<>` **不要**全部挤在最终的 `return` 里。条件面板、独立 section、较重 Modal 等实质块应抽成组件函数，主组件 return 只做编排组合。
- 推荐形态：

```jsx
function RulesPanel({ ... }) {
  return (/* ... */)
}

export function AgentPanel() {
  // state / handlers ...
  return (
    <aside>
      <header>...</header>
      {panelMode === 'rules' ? <RulesPanel ... /> : <ChatPanel ... />}
    </aside>
  )
}
```

- **代码较短**（约二十行以内的 header、空态、单行 banner 等）可以不提前，直接写在 return 里。

---

## 2. 体量限制与职责划分

- **单函数主体**：最好不要超过 **500 行**（含 JSX）。过长时按 UI 职责拆子组件或抽 hook。
- **单 jsx 文件**：建议控制在 **600～800 行**以内。同文件重组后仍超限 → 拆到 `components/<域>/` 独立文件。
- 注意解耦、职责划分明确：
  - **pages/**：路由页，管数据拉取、状态与编排。
  - **components/<域>/**：可复用的展示块（如 `editor/`、`onboarding/`）。
  - **api / utils / stores**：无 UI 的请求、纯函数、跨页状态。

### Agent 域分层（`components/editor/Agent/`）

编辑页右侧 Agent 栏已按域拆目录，后续扩展（生成链路、会话、规则）优先落在对应层，避免再堆回单文件：

| 目录 | 职责 |
| --- | --- |
| `component/` | UI：`AgentPanel` 编排；`shell/`（遮罩与快捷指令）；`chatpanel/`；`inputbar/` |
| `hook/` | 会话 / 规则 / 生成等 React 状态与编排（`useAgentPanel` 组合） |
| `service/` | Agent 域数据链路（封装 `api/`、占位/真实 generate）；不依赖 React |
| `utils/` | 纯函数与常量 |
| `index.jsx` | 唯一对外出口：`export { AgentPanel }` |

- 页面只 `import { AgentPanel } from '../components/editor/Agent'`。
- 快捷指令属壳层（`shell/QuickActions`），不属于 `inputbar`。
- 头栏入口较少时可内联在 `AgentPanel`，不必再抽 Header 文件。
- 样式放在 `Agent/styles/`，按 UI 块拆分（`AgentPanel.css`、`ChatPanel.css`、`InputBar.css`、`QuickActions.css`、`HistoryPanel.css`、`RulesPanel.css`），由对应组件引入。

---

## 3. 组件声明位置

- 子组件写在**文件顶层**（sibling）或**独立文件**，**禁止**在父组件函数体内声明组件（避免每次渲染重建类型、状态丢失）。
- 样式与组件同目录、同名 `.css`；域模块可集中一份样式由入口组件引入（如 `Agent/Agent.css`）。

---

## 4. 结构重构约定

- 纯结构重构时保持 `className`、文案、API 契约与交互语义不变。
- 新增页面或改动较大时，同步更新 `docs/build/` 架构笔记（见根目录 AGENTS.md §8）。

---

## 5. 其他约定（后续可补充）

- 优先复用已有 `components/ui`（Button、Modal、Badge 等），避免平行再造一套控件。
- 模型调用与提示词不在前端硬编码；生成走后端 skill / generate 接口。
- 错误信息用 `getErrorMessage` 等统一封装，给用户可读文案。
