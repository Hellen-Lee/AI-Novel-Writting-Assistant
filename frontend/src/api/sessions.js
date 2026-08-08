import { api } from './client'

export async function listSessions(projectId) {
  const { data } = await api.get(`/projects/${projectId}/agent/sessions`)
  return data
}

export async function createSession(projectId, title = '新对话') {
  const { data } = await api.post(`/projects/${projectId}/agent/sessions`, {
    title,
  })
  return data
}

export async function getSession(projectId, sessionId) {
  const { data } = await api.get(
    `/projects/${projectId}/agent/sessions/${sessionId}`,
  )
  return data
}

export async function deleteSession(projectId, sessionId) {
  await api.delete(`/projects/${projectId}/agent/sessions/${sessionId}`)
}
