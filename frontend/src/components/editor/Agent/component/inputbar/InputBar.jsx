import { ArrowUp, Plus, Square, TextQuote, X } from 'lucide-react'
import { countWords } from '../../../../../utils/format'
import '../../styles/InputBar.css'
import { ContextUsageRing } from './ContextUsageRing'
import { ModelPicker } from './ModelPicker'

/** 选区预览：压缩空白后截断，chip 内单行展示 */
function selectionPreview(text, max = 48) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** 正文选区 chip：提示"选中段落将随本条消息一起发给模型" */
function SelectionChip({ selection, onClear }) {
  const { text, anchor } = selection
  const range =
    anchor && anchor.startPara
      ? anchor.startPara === anchor.endPara
        ? `第 ${anchor.startPara} 段`
        : `第 ${anchor.startPara}–${anchor.endPara} 段`
      : '选中文本'
  return (
    <div className="agent-panel__selection" title={text}>
      <TextQuote size={12} aria-hidden />
      <span className="agent-panel__selection-range">
        已选 {range} · {countWords(text)} 字
      </span>
      <span className="agent-panel__selection-preview">
        {selectionPreview(text)}
      </span>
      <button
        type="button"
        className="agent-panel__selection-clear"
        aria-label="移除选区"
        title="移除选区"
        onClick={onClear}
      >
        <X size={12} />
      </button>
    </div>
  )
}

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
  selection = null,
  onClearSelection,
  contextUsage = null,
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
        {selection?.text ? (
          <SelectionChip selection={selection} onClear={onClearSelection} />
        ) : null}
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

          <ContextUsageRing
            used={contextUsage?.used}
            window={contextUsage?.window}
            loading={generating}
          />

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
