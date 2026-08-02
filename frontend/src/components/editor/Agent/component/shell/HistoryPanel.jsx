import { X } from 'lucide-react'
import '../../styles/HistoryPanel.css'

export function HistoryPanel({
  sessions,
  activeSessionId,
  onClose,
  onSelectSession,
}) {
  return (
    <div className="agent-panel__overlay">
      <div className="agent-panel__overlay-head">
        <h3>历史会话</h3>
        <button
          type="button"
          className="agent-panel__icon-btn"
          aria-label="关闭"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      <ul className="agent-panel__session-list">
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`agent-panel__session${s.id === activeSessionId ? ' is-active' : ''}`}
              onClick={() => onSelectSession(s.id)}
            >
              <span className="agent-panel__session-title">{s.title}</span>
              <span className="agent-panel__session-meta">
                {s.messages.length} 条消息
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="agent-panel__hint">会话仅保存在本页内存，刷新后清空。</p>
    </div>
  )
}
