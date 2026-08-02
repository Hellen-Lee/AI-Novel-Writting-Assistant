import { Plus } from 'lucide-react'
import './EditorPage.css'

/**
 * 编辑页三栏骨架
 * 设计对照：Explore/Editor-v3 (NMi2X)、Review/Screen/Editor-v2 (N0lDh)
 */
export default function EditorPage() {
  return (
    <div className="editor-page">
      <aside className="editor-page__sidebar">
        <div className="editor-page__sidebar-head">
          <h2>目录</h2>
          <button type="button" className="editor-page__icon-btn" aria-label="新建章节">
            <Plus size={16} />
          </button>
        </div>
        <nav className="editor-page__chapters" aria-label="章节列表">
          <button type="button" className="editor-page__chapter">
            第01章
          </button>
          <button type="button" className="editor-page__chapter is-active">
            第七星渊
          </button>
          <button type="button" className="editor-page__chapter">
            第03章
          </button>
        </nav>
        <div className="editor-page__sidebar-foot">当前章节字数：—</div>
      </aside>

      <section className="editor-page__main">
        <header className="editor-page__main-head">
          <div>
            <h1>第七星渊</h1>
            <p className="editor-page__meta">正文编辑区 · 完整编辑器将在 4.4 实现</p>
          </div>
        </header>
        <div className="editor-page__canvas">
          <p className="editor-page__placeholder-text">
            在此编写章节正文。左侧为章节目录，右侧为 AI Agent 对话栏。
          </p>
        </div>
      </section>

      <aside className="editor-page__agent">
        <header className="editor-page__agent-head">
          <h2>AI 助手</h2>
        </header>
        <div className="editor-page__agent-body">
          <p className="editor-page__agent-empty">
            对话、快捷指令（续写 / 润色 / 扩写 / 生成设定）将在后续接入。
          </p>
        </div>
        <footer className="editor-page__agent-foot">
          <div className="editor-page__quick-actions">
            <span>续写</span>
            <span>润色</span>
            <span>扩写</span>
            <span>生成</span>
          </div>
          <div className="editor-page__input-shell">输入指令或 /skill …</div>
        </footer>
      </aside>
    </div>
  )
}
