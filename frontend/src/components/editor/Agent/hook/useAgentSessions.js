import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../../../../api/client'
import {
  createRemoteSession,
  ensureActiveSession,
  loadSessionDetail,
} from '../service/sessions'

/**
 * Agent 会话：REST 落盘；切换前由调用方 abort 生成。
 */
export function useAgentSessions({ projectId, onBeforeSwitch } = {}) {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [loading, setLoading] = useState(Boolean(projectId))
  const [loadError, setLoadError] = useState('')
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

  const handleNewChat = async () => {
    if (!projectId) return null
    onBeforeSwitch?.()
    try {
      const created = await createRemoteSession(
        projectId,
        `对话 ${sessions.length + 1}`,
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
      const detail = await loadSessionDetail(projectId, id)
      setSessions((prev) =>
        prev.map((s) => (s.id === detail.id ? { ...s, ...detail } : s)),
      )
    } catch (err) {
      setLoadError(getErrorMessage(err, '加载会话失败'))
    }
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    loading,
    loadError,
    updateActiveSession,
    updateSessionById,
    handleNewChat,
    handleSelectSession,
    setLoadError,
  }
}
