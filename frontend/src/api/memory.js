import { api } from './client'

export async function getMemory(projectId) {
  const { data } = await api.get(`/projects/${projectId}/memory`)
  return data
}

export async function putMemory(projectId, memory) {
  const { data } = await api.put(`/projects/${projectId}/memory`, memory)
  return data
}

export async function createMemoryEntry(projectId, category, payload) {
  const { data } = await api.post(
    `/projects/${projectId}/memory/${category}`,
    payload,
  )
  return data
}

export async function updateMemoryEntry(projectId, category, entryId, payload) {
  const { data } = await api.put(
    `/projects/${projectId}/memory/${category}/${entryId}`,
    payload,
  )
  return data
}

export async function deleteMemoryEntry(projectId, category, entryId) {
  const { data } = await api.delete(
    `/projects/${projectId}/memory/${category}/${entryId}`,
  )
  return data
}
