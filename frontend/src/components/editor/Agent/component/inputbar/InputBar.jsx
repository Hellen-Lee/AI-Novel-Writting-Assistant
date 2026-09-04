import { ArrowUp, Plus, Square, X } from 'lucide-react'
import '../../styles/InputBar.css'
import { ModelPicker } from './ModelPicker'

/** 底栏：notice + 输入区（快捷指令仅出现在无消息空态） */
export function InputBar({
  notice,
  onDismissNotice,
  generating,
  input,
  onInputChange,
  onSend,
  onStop,
  onShowAttachNotice,
  modelOptions = [],
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

      <div className="agent-panel__composer">
        <textarea
          className="agent-panel__input"
          rows={2}
          value={input}
          disabled={generating}
          placeholder={
            generating
              ? '正在生成回复，可点击终止…'
              : '直接对话，或输入 /技能名、点下方快捷指令…'
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
            options={modelOptions}
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
