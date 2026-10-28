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

/** 重命名会话（只改标题，不影响归档时间） */
export async function updateSession(projectId, sessionId, title) {
  const { data } = await api.put(
    `/projects/${projectId}/agent/sessions/${sessionId}`,
    { title },
  )
  return data
}

/** 清空项目全部会话，返回删除条数 */
export async function clearSessions(projectId) {
  const { data } = await api.delete(`/projects/${projectId}/agent/sessions`)
  return data
}
