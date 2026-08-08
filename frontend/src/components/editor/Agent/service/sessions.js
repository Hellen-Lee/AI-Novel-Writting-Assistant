import {
  createSession as apiCreateSession,
  deleteSession as apiDeleteSession,
  getSession as apiGetSession,
  listSessions as apiListSessions,
} from '../../../../api/sessions'

/** Map API session summary → UI list item */
export function mapSessionSummary(item) {
  return {
    id: item.id,
    title: item.title || '新对话',
    messages: [],
    updatedAt: item.updated_at || Date.now(),
    messageCount: item.message_count ?? 0,
    status: item.status || 'idle',
  }
}

/** Map API session detail → UI session */
export function mapSessionDetail(detail) {
  return {
    id: detail.id,
    title: detail.title || '新对话',
    messages: (detail.messages || []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content || '',
      skill: m.skill || '',
      pending: Boolean(m.pending),
      error: m.error || '',
    })),
    updatedAt: detail.updated_at || Date.now(),
    status: detail.status || 'idle',
  }
}

export async function loadSessionList(projectId) {
  const data = await apiListSessions(projectId)
  return (data.sessions || []).map(mapSessionSummary)
}

/** Dedupe concurrent ensure (e.g. React StrictMode double mount). */
const ensureInflight = new Map()

export async function ensureActiveSession(projectId) {
  if (ensureInflight.has(projectId)) {
    return ensureInflight.get(projectId)
  }

  const task = (async () => {
    let list = await loadSessionList(projectId)
    if (!list.length) {
      const created = await createRemoteSession(projectId, '当前会话')
      list = await loadSessionList(projectId)
      if (!list.length) {
        return {
          list: [
            {
              id: created.id,
              title: created.title,
              messages: created.messages,
              updatedAt: created.updatedAt,
              messageCount: created.messages.length,
              status: created.status,
            },
          ],
          active: created,
        }
      }
    }
    const firstId = list[0].id
    const active = await loadSessionDetail(projectId, firstId)
    const merged = list.map((s) =>
      s.id === active.id ? { ...s, ...active } : s,
    )
    return { list: merged, active }
  })().finally(() => {
    ensureInflight.delete(projectId)
  })

  ensureInflight.set(projectId, task)
  return task
}

export async function loadSessionDetail(projectId, sessionId) {
  const detail = await apiGetSession(projectId, sessionId)
  return mapSessionDetail(detail)
}

export async function createRemoteSession(projectId, title = '新对话') {
  const detail = await apiCreateSession(projectId, title)
  return mapSessionDetail(detail)
}

export async function removeRemoteSession(projectId, sessionId) {
  await apiDeleteSession(projectId, sessionId)
}
