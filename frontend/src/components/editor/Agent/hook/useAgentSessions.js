import { useState } from 'react'
import { createSession } from '../utils/session'

export function useAgentSessions() {
  const [sessions, setSessions] = useState(() => [createSession('当前会话')])
  const [activeSessionId, setActiveSessionId] = useState(sessions[0].id)

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0]

  const updateActiveSession = (updater) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s
        const next = updater(s)
        return { ...next, updatedAt: Date.now() }
      }),
    )
  }

  const handleNewChat = () => {
    const session = createSession(`对话 ${sessions.length + 1}`)
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(session.id)
    return session
  }

  const handleSelectSession = (id) => {
    setActiveSessionId(id)
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    updateActiveSession,
    handleNewChat,
    handleSelectSession,
  }
}
