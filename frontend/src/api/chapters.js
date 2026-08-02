import { api } from './client'

export async function listChapters(projectId) {
  const { data } = await api.get(`/projects/${projectId}/chapters`)
  return data
}

export async function getChapter(projectId, chapterId) {
  const { data } = await api.get(`/projects/${projectId}/chapters/${chapterId}`)
  return data
}

export async function createChapter(projectId, payload = {}) {
  const { data } = await api.post(`/projects/${projectId}/chapters`, payload)
  return data
}

export async function updateChapter(projectId, chapterId, payload) {
  const { data } = await api.put(
    `/projects/${projectId}/chapters/${chapterId}`,
    payload,
  )
  return data
}
