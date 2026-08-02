import { api } from './client'

export async function getMemory(projectId) {
  const { data } = await api.get(`/projects/${projectId}/memory`)
  return data
}

export async function putMemory(projectId, memory) {
  const { data } = await api.put(`/projects/${projectId}/memory`, memory)
  return data
}
