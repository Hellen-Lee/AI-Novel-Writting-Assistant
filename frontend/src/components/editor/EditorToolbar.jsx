import { Bot, Download, SlidersHorizontal } from 'lucide-react'
import './EditorToolbar.css'

/**
 * 编辑区右上角工具栏：Agent 对话 / 规则 / 导出（占位）
 * 设计对照：d7ubn Toolbar/Editor (gnTAb)
 */
export function EditorToolbar({
  activeMode,
  panelOpen,
  hasTempRules,
  onSelectAgent,
  onSelectRules,
  onExport,
}) {
  const agentActive = panelOpen && activeMode === 'agent'
  const rulesActive = panelOpen && activeMode === 'rules'

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="编辑区工具">
      <button
        type="button"
        className={`editor-toolbar__btn${agentActive ? ' is-active' : ''}`}
        aria-label="Agent 对话"
        title="Agent 对话"
        aria-pressed={agentActive}
        onClick={onSelectAgent}
      >
        <Bot size={15} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className={`editor-toolbar__btn${rulesActive ? ' is-active' : ''}${hasTempRules ? ' has-temp-rules' : ''}`}
        aria-label="规则"
        title={hasTempRules ? '规则（已设临时规则）' : '规则'}
        aria-pressed={rulesActive}
        onClick={onSelectRules}
      >
        <SlidersHorizontal size={15} strokeWidth={2} aria-hidden />
        {hasTempRules ? <span className="editor-toolbar__dot" aria-hidden /> : null}
      </button>
      <button
        type="button"
        className="editor-toolbar__btn"
        aria-label="导出"
        title="导出"
        onClick={onExport}
      >
        <Download size={15} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}
