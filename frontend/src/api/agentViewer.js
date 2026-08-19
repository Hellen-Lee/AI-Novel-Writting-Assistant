import { api } from './client'

export async function listAgentRuns(projectId) {
  const { data } = await api.get(`/dev/projects/${projectId}/agent/runs`)
  return data
}

export async function getAgentRun(projectId, runId) {
  const { data } = await api.get(`/dev/projects/${projectId}/agent/runs/${runId}`)
  return data
}

export async function listSessionAgentRuns(projectId, sessionId) {
  const { data } = await api.get(
    `/dev/projects/${projectId}/agent/sessions/${sessionId}/runs`,
  )
  return data
}
