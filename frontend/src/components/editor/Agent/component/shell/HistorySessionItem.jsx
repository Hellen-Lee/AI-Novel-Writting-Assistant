import { Ellipsis, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatUpdatedAt } from '../../../../../utils/format'

function sessionTitle(session) {
  const stamp = formatUpdatedAt(session?.updatedAt)
  return stamp ? `${session.title} · ${stamp}` : String(session?.title || '')
}

/**
 * 单条历史会话：hover 显示「⋯」，下拉含重命名 / 删除；重命名走行内输入框。
 * 设计对照：OckRz 的 Session/Active · Session/Hover · Session/MenuOpen。
 */
export function HistorySessionItem({
  session,
  active,
  onSelect,
  onRename,
  onRequestDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuUp, setMenuUp] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title || '')
  const itemRef = useRef(null)
  const inputRef = useRef(null)
  // Enter/Esc 提交或取消后浏览器还会触发 blur，用标记避免二次提交
  const settledRef = useRef(false)

  useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (e) => {
      if (!itemRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!editing) return
    const input = inputRef.current
    input?.focus()
    input?.select()
  }, [editing])

  // 会话被外部改名（例如重命名失败回滚）时同步草稿
  useEffect(() => {
    if (!editing) setDraft(session.title || '')
  }, [session.title, editing])

  const startRename = () => {
    setMenuOpen(false)
    setDraft(session.title || '')
    settledRef.current = false
    setEditing(true)
  }

  // 菜单贴近滚动容器上下边界时朝空间更大的一侧展开，避免被 overflow 裁掉
  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    const rect = itemRef.current?.getBoundingClientRect()
    if (rect) {
      const scroller = itemRef.current?.closest('.agent-panel__history-groups')
      const bounds = scroller?.getBoundingClientRect()
      const top = bounds?.top ?? 0
      const bottom = bounds?.bottom ?? window.innerHeight
      const menuHeight = 84
      setMenuUp(rect.bottom + menuHeight > bottom && rect.top - menuHeight > top)
    }
    setMenuOpen(true)
  }

  const commit = async () => {
    if (settledRef.current) return
    settledRef.current = true
    const next = draft.trim()
    setEditing(false)
    if (!next || next === session.title) return
    const ok = await onRename?.(session.id, next)
    if (!ok) setDraft(session.title || '')
  }

  const cancel = () => {
    settledRef.current = true
    setEditing(false)
    setDraft(session.title || '')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
  }

  const handleDelete = () => {
    setMenuOpen(false)
    onRequestDelete?.(session)
  }

  return (
    <li
      ref={itemRef}
      className={`agent-panel__session-row${active ? ' is-active' : ''}`}
    >
      {active ? <span className="agent-panel__session-accent" aria-hidden /> : null}

      {editing ? (
        <input
          ref={inputRef}
          className="agent-panel__session-rename"
          value={draft}
          maxLength={64}
          aria-label="会话名称"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
        />
      ) : (
        <button
          type="button"
          className="agent-panel__session"
          title={sessionTitle(session)}
          aria-current={active ? 'true' : undefined}
          onClick={() => onSelect?.(session.id)}
        >
          <span className="agent-panel__session-title">{session.title}</span>
        </button>
      )}

      {!editing ? (
        <button
          type="button"
          className={`agent-panel__session-more${menuOpen ? ' is-open' : ''}`}
          aria-label="会话操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={toggleMenu}
        >
          <Ellipsis size={14} />
        </button>
      ) : null}

      {menuOpen ? (
        <div
          className={`agent-panel__session-menu${menuUp ? ' is-up' : ''}`}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="agent-panel__session-menu-item"
            onClick={startRename}
          >
            <Pencil size={14} />
            重命名
          </button>
          <button
            type="button"
            role="menuitem"
            className="agent-panel__session-menu-item agent-panel__session-menu-item--danger"
            onClick={handleDelete}
          >
            <Trash2 size={14} />
            删除会话
          </button>
        </div>
      ) : null}
    </li>
  )
}
