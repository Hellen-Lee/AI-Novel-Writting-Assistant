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

---

## 3. 组件声明位置

- 子组件写在**文件顶层**（sibling）或**独立文件**，**禁止**在父组件函数体内声明组件（避免每次渲染重建类型、状态丢失）。
- 样式与组件同目录、同名 `.css`（如 `AgentPanel.jsx` + `AgentPanel.css`）。

---

## 4. 结构重构约定

- 纯结构重构时保持 `className`、文案、API 契约与交互语义不变。
- 新增页面或改动较大时，同步更新 `docs/build/` 架构笔记（见根目录 AGENTS.md §8）。

---

## 5. 其他约定（后续可补充）

- 优先复用已有 `components/ui`（Button、Modal、Badge 等），避免平行再造一套控件。
- 模型调用与提示词不在前端硬编码；生成走后端 skill / generate 接口。
- 错误信息用 `getErrorMessage` 等统一封装，给用户可读文案。
