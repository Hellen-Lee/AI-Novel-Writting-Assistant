import {
  ChevronLeft,
  MessageSquarePlus,
  PanelRightClose,
  Search,
  Trash2,
} from 'lucide-react'
import '../../styles/HistoryPanel.css'

/**
 * 历史会话 UI 壳（搜索 / 分组 / 清空等交互占位）
 * 设计对照：OckRz Review/Sidebar/Agent-History
 */
export function HistoryPanel({
  sessions,
  activeSessionId,
  onClose,
  onSelectSession,
  onNewChat,
  onCollapse,
  onShowNotice,
}) {
  const count = sessions.length

  return (
    <div className="agent-panel__history">
      <header className="agent-panel__history-head">
        <div className="agent-panel__history-head-left">
          <button
            type="button"
            className="agent-panel__icon-btn"
            aria-label="返回对话"
            title="返回"
            onClick={onClose}
          >
            <ChevronLeft size={16} />
          </button>
          <h3>历史会话</h3>
        </div>
        <div className="agent-panel__head-actions">
          <button
            type="button"
            className="agent-panel__icon-btn"
            aria-label="新建对话"
            title="新建对话"
            onClick={onNewChat}
          >
            <MessageSquarePlus size={15} />
          </button>
          <button
            type="button"
            className="agent-panel__icon-btn"
            aria-label="收起侧栏"
            title="收起"
            onClick={onCollapse}
          >
            <PanelRightClose size={15} />
          </button>
        </div>
      </header>

      <div className="agent-panel__history-body">
        <div className="agent-panel__history-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            className="agent-panel__history-search-input"
            placeholder="搜索会话…"
            disabled
            aria-disabled="true"
          />
        </div>

        <div className="agent-panel__history-groups">
          <div className="agent-panel__history-group">
            <p className="agent-panel__history-group-label">今天</p>
            {sessions.length === 0 ? (
              <p className="agent-panel__history-empty">暂无会话</p>
            ) : (
              <ul className="agent-panel__session-list">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`agent-panel__session${s.id === activeSessionId ? ' is-active' : ''}`}
                      onClick={() => onSelectSession(s.id)}
                    >
                      <span className="agent-panel__session-title">
                        {s.title}
                      </span>
                      <span className="agent-panel__session-meta">
                        {s.messages.length} 条消息
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="agent-panel__history-group agent-panel__history-group--placeholder">
            <p className="agent-panel__history-group-label">昨天</p>
            <p className="agent-panel__history-empty">分组逻辑待接入</p>
          </div>
          <div className="agent-panel__history-group agent-panel__history-group--placeholder">
            <p className="agent-panel__history-group-label">更早</p>
            <p className="agent-panel__history-empty">分组逻辑待接入</p>
          </div>
        </div>
      </div>

      <footer className="agent-panel__history-footer">
        <span className="agent-panel__history-count">共 {count} 条会话</span>
        <button
          type="button"
          className="agent-panel__history-clear"
          disabled
          title="清空历史待后续版本接入"
          onClick={() => onShowNotice?.('清空历史待后续版本接入。')}
        >
          <Trash2 size={12} aria-hidden />
          清空历史
        </button>
      </footer>
    </div>
  )
}
