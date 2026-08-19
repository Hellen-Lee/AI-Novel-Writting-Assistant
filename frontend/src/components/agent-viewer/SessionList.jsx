import { formatPct, formatRunTime } from './format'
import './SessionList.css'

export function SessionList({ sessions, selectedSessionId, onSelectSession }) {
  if (!sessions.length) {
    return (
      <div className="agent-viewer-list__empty">
        此项目还没有会话记录。在编辑页生成一次后再刷新。
      </div>
    )
  }

  return (
    <ul className="agent-viewer-list">
      {sessions.map((session) => {
        const active = session.sessionId === selectedSessionId
        return (
          <li key={session.sessionId}>
            <button
              type="button"
              className={`agent-viewer-session${active ? ' is-active' : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelectSession(session.sessionId)}
            >
              <span className="agent-viewer-session__title">
                {session.title}
              </span>
              <span className="agent-viewer-session__meta">
                {session.runs.length} 轮
                {' · 剩余 '}
                {formatPct(session.remainingPct)}
                {session.truncated ? ' · 截断' : ''}
                {' · '}
                {formatRunTime(session.updatedAt)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
