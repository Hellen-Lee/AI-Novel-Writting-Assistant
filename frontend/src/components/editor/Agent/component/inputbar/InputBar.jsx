import { ArrowUp, Plus, Square, X } from 'lucide-react'
import '../../styles/InputBar.css'
import { ModelPicker } from './ModelPicker'

/**
 * 底栏：notice + 可选 actions 槽（快捷指令）+ 输入区。
 * actions 由 AgentPanel 传入 shell/QuickActions，保持原 footer 视觉顺序。
 */
export function InputBar({
  notice,
  onDismissNotice,
  actions = null,
  generating,
  input,
  onInputChange,
  onSend,
  onStop,
  onShowAttachNotice,
  selectedModel,
  modelOpen,
  modelId,
  onToggleModel,
  onSelectModel,
}) {
  return (
    <footer className="agent-panel__foot">
      {notice ? (
        <div className="agent-panel__notice" role="status">
          {notice}
          <button
            type="button"
            className="agent-panel__notice-close"
            aria-label="关闭提示"
            onClick={onDismissNotice}
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      {actions}

      <div className="agent-panel__composer">
        <textarea
          className="agent-panel__input"
          rows={2}
          value={input}
          disabled={generating}
          placeholder={
            generating
              ? '正在生成回复，可点击终止…'
              : '输入 / 调用技能，或直接对话…'
          }
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <div className="agent-panel__toolrow">
          <button
            type="button"
            className="agent-panel__tool-btn"
            aria-label="附加"
            title="附加（占位）"
            onClick={onShowAttachNotice}
          >
            <Plus size={16} />
          </button>

          <ModelPicker
            selectedModel={selectedModel}
            modelOpen={modelOpen}
            modelId={modelId}
            onToggleModel={onToggleModel}
            onSelectModel={onSelectModel}
          />

          <div className="agent-panel__toolrow-spacer" />

          {generating ? (
            <button
              type="button"
              className="agent-panel__send agent-panel__send--stop"
              aria-label="终止生成"
              onClick={onStop}
            >
              <Square size={10} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="agent-panel__send"
              aria-label="发送"
              onClick={onSend}
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </footer>
  )
}
