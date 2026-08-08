export function MessageItem({
  message,
  draft,
  onApplyDraft,
  onDiscardDraft,
  onRetry,
}) {
  if (message.role === 'user') {
    return (
      <div className="agent-panel__msg agent-panel__msg--user">
        <div className="agent-panel__bubble agent-panel__bubble--user">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="agent-panel__msg agent-panel__msg--ai">
      <div className="agent-panel__ai-meta">
        <span className="agent-panel__ai-name">Agent</span>
        {message.skill ? (
          <span className="agent-panel__ai-skill">· {message.skill}</span>
        ) : null}
      </div>
      <div className="agent-panel__bubble agent-panel__bubble--ai">
        <p>
          {message.content ||
            (message.pending ? '正在生成…' : message.error || '')}
        </p>
        {message.pending && !message.error ? (
          <div className="agent-panel__msg-actions">
            <button
              type="button"
              className="agent-panel__mini-btn agent-panel__mini-btn--primary"
              disabled={!draft?.text || draft.status === 'streaming'}
              onClick={() => onApplyDraft?.()}
            >
              插入文末
            </button>
            <button
              type="button"
              className="agent-panel__mini-btn"
              disabled={draft?.status === 'streaming'}
              onClick={onRetry}
            >
              重写
            </button>
            <button
              type="button"
              className="agent-panel__mini-btn agent-panel__mini-btn--ghost"
              disabled={draft?.status === 'streaming'}
              onClick={() => onDiscardDraft?.()}
            >
              弃用
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
