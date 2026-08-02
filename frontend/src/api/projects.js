import { api } from './client'

export async function listProjects() {
  const { data } = await api.get('/projects')
  return data
}

export async function getProject(projectId) {
  const { data } = await api.get(`/projects/${projectId}`)
  return data
}

export async function createProject(payload) {
  const { data } = await api.post('/projects', payload)
  return data
}

export async function updateProject(projectId, payload) {
  const { data } = await api.put(`/projects/${projectId}`, payload)
  return data
}

export async function deleteProject(projectId) {
  const { data } = await api.delete(`/projects/${projectId}`)
  return data
}
