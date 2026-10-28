import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../../../../api/client'
import {
  clearRemoteSessions,
  createRemoteSession,
  ensureActiveSession,
  loadSessionDetail,
  removeRemoteSession,
  renameRemoteSession,
} from '../service/sessions'

/**
 * Agent 会话：REST 落盘；切换前由调用方 abort 生成。
 */
export function useAgentSessions({ projectId, onBeforeSwitch } = {}) {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [loading, setLoading] = useState(Boolean(projectId))
  const [loadError, setLoadError] = useState('')
  // 历史面板内联错误：历史视图不渲染 InputBar 通知条，需就地提示
  const [historyError, setHistoryError] = useState('')
  const activeIdRef = useRef('')

  useEffect(() => {
    activeIdRef.current = activeSessionId
  }, [activeSessionId])

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0] || null

  const updateActiveSession = useCallback((updater) => {
    const id = activeIdRef.current
    if (!id) return
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        const next = typeof updater === 'function' ? updater(s) : updater
        return { ...next, updatedAt: Date.now() }
      }),
    )
  }, [])

  const updateSessionById = useCallback((sessionId, updater) => {
    if (!sessionId) return
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s
        const next = typeof updater === 'function' ? updater(s) : updater
        return { ...next, updatedAt: Date.now() }
      }),
    )
  }, [])

  useEffect(() => {
    if (!projectId) {
      setSessions([])
      setActiveSessionId('')
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setLoadError('')
    setHistoryError('')

    ;(async () => {
      try {
        const { list, active } = await ensureActiveSession(projectId)
        if (cancelled) return
        setSessions(list)
        setActiveSessionId(active.id)
      } catch (err) {
        if (!cancelled) {
          setLoadError(getErrorMessage(err, '加载会话失败'))
          setSessions([])
          setActiveSessionId('')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectId])

  const handleNewChat = async (title) => {
    if (!projectId) return null
    onBeforeSwitch?.()
    try {
      const created = await createRemoteSession(
        projectId,
        title || `对话 ${sessions.length + 1}`,
      )
      setSessions((prev) => [
        {
          id: created.id,
          title: created.title,
          messages: created.messages,
          updatedAt: created.updatedAt,
          messageCount: 0,
          status: created.status,
        },
        ...prev,
      ])
      setActiveSessionId(created.id)
      return created
    } catch (err) {
      setLoadError(getErrorMessage(err, '新建会话失败'))
      return null
    }
  }

  const loadDetailInto = useCallback(
    async (id) => {
      const detail = await loadSessionDetail(projectId, id)
      setSessions((prev) =>
        prev.map((s) => (s.id === detail.id ? { ...s, ...detail } : s)),
      )
      return detail
    },
    [projectId],
  )

  const handleSelectSession = async (id) => {
    if (!projectId || !id || id === activeSessionId) {
      setActiveSessionId(id)
      return
    }
    onBeforeSwitch?.()
    setActiveSessionId(id)
    const cached = sessions.find((s) => s.id === id)
    if (cached?.messages?.length) return

    try {
      await loadDetailInto(id)
    } catch (err) {
      setLoadError(getErrorMessage(err, '加载会话失败'))
    }
  }

  /** 重命名：只改标题，不动 updated_at，因此归档位置与顺序保持不变 */
  const handleRenameSession = async (id, title) => {
    const clean = String(title || '').trim()
    if (!projectId || !id || !clean) return false
    setHistoryError('')
    try {
      const summary = await renameRemoteSession(projectId, id, clean)
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: summary.title } : s)),
      )
      return true
    } catch (err) {
      setHistoryError(getErrorMessage(err, '重命名会话失败'))
      return false
    }
  }

  /** 删除会话；若删掉的是当前会话，自动切到下一条，全部删空则新建一条 */
  const handleDeleteSession = async (id) => {
    if (!projectId || !id) return false
    setHistoryError('')
    if (id === activeIdRef.current) onBeforeSwitch?.()
    try {
      await removeRemoteSession(projectId, id)
    } catch (err) {
      setHistoryError(getErrorMessage(err, '删除会话失败'))
      return false
    }

    const remaining = sessions.filter((s) => s.id !== id)
    setSessions(remaining)
    if (id !== activeIdRef.current) return true

    const next = remaining[0]
    if (!next) {
      // 全部删空时补一条空会话，保证生成链路随时可用
      setActiveSessionId('')
      await handleNewChat('新对话')
      return true
    }
    setActiveSessionId(next.id)
    if (!next.messages?.length) {
      try {
        await loadDetailInto(next.id)
      } catch (err) {
        setHistoryError(getErrorMessage(err, '加载会话失败'))
      }
    }
    return true
  }

  /** 清空历史：后端删除全部会话后立即新建一条空会话 */
  const handleClearSessions = async () => {
    if (!projectId) return false
    setHistoryError('')
    onBeforeSwitch?.()
    try {
      await clearRemoteSessions(projectId)
    } catch (err) {
      setHistoryError(getErrorMessage(err, '清空会话失败'))
      return false
    }
    setSessions([])
    setActiveSessionId('')
    await handleNewChat('新对话')
    return true
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    loading,
    loadError,
    historyError,
    setHistoryError,
    updateActiveSession,
    updateSessionById,
    handleNewChat,
    handleSelectSession,
    handleRenameSession,
    handleDeleteSession,
    handleClearSessions,
    setLoadError,
  }
}
