import {
  ChevronLeft,
  MessageSquarePlus,
  PanelRightClose,
  Search,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfirmDialog } from '../../../../ui/ConfirmDialog'
import {
  filterSessionsByTitle,
  groupSessionsByTime,
} from '../../utils/historyGroups'
import '../../styles/HistoryPanel.css'
import { HistorySessionItem } from './HistorySessionItem'

/**
 * 历史会话：搜索 / 按时间归档 / 重命名 / 删除 / 清空
 * 设计对照：OckRz Review/Sidebar/Agent-History
 */
export function HistoryPanel({
  sessions,
  activeSessionId,
  error = '',
  onClose,
  onSelectSession,
  onNewChat,
  onCollapse,
  onRenameSession,
  onDeleteSession,
  onClearSessions,
}) {
  const [keyword, setKeyword] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const count = sessions.length
  const groups = useMemo(
    () => groupSessionsByTime(filterSessionsByTitle(sessions, keyword)),
    [sessions, keyword],
  )
  const matched = groups.reduce((total, group) => total + group.sessions.length, 0)
  const searching = Boolean(keyword.trim())

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setBusy(true)
    await onDeleteSession?.(pendingDelete.id)
    setBusy(false)
    setPendingDelete(null)
  }

  const confirmClear = async () => {
    setBusy(true)
    await onClearSessions?.()
    setBusy(false)
    setClearOpen(false)
  }

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
        <div className="agent-panel__history-topbar">
          <div className="agent-panel__history-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              className="agent-panel__history-search-input"
              placeholder="搜索会话…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              aria-label="搜索会话"
            />
          </div>
        </div>

        {error ? (
          <p className="agent-panel__history-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="agent-panel__history-groups">
          {count === 0 ? (
            <p className="agent-panel__history-empty">暂无会话</p>
          ) : groups.length === 0 ? (
            <p className="agent-panel__history-empty">
              没有匹配「{keyword.trim()}」的会话
            </p>
          ) : (
            groups.map((group) => (
              <section className="agent-panel__history-group" key={group.key}>
                <p className="agent-panel__history-group-label">{group.label}</p>
                <ul className="agent-panel__session-list">
                  {group.sessions.map((session) => (
                    <HistorySessionItem
                      key={session.id}
                      session={session}
                      active={session.id === activeSessionId}
                      onSelect={onSelectSession}
                      onRename={onRenameSession}
                      onRequestDelete={setPendingDelete}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

      <footer className="agent-panel__history-footer">
        <span className="agent-panel__history-count">
          {searching ? `匹配 ${matched} 条 / ` : ''}
          共 {count} 条会话
        </span>
        <button
          type="button"
          className="agent-panel__history-clear"
          disabled={count === 0}
          title={count === 0 ? '暂无可清空的会话' : '删除本项目全部会话'}
          onClick={() => setClearOpen(true)}
        >
          <Trash2 size={12} aria-hidden />
          清空历史
        </button>
      </footer>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        busy={busy}
        title="删除会话"
        message={`确定删除「${pendingDelete?.title || ''}」？`}
        hint="会话消息与附件将一并从本地移除，且不可恢复。"
        confirmText="删除"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={clearOpen}
        danger
        busy={busy}
        title="清空历史"
        message={`确定清空本项目全部 ${count} 条会话？`}
        hint="所有会话消息与附件将一并从本地移除，且不可恢复。"
        confirmText="清空"
        onConfirm={confirmClear}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  )
}
