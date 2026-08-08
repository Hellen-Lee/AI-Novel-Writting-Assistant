import { api } from './client'

/** GET /api/skills */
export async function listSkills(params = {}) {
  const { data } = await api.get('/skills', { params })
  return data
}

/** GET /api/skills/{name} */
export async function getSkill(name) {
  const { data } = await api.get(`/skills/${encodeURIComponent(name)}`)
  return data
}

/** PUT /api/skills/{name} — 新建或更新自定义 skill（可覆盖内置同名） */
export async function saveSkill(name, payload) {
  const { data } = await api.put(
    `/skills/${encodeURIComponent(name)}`,
    payload,
  )
  return data
}

/** DELETE /api/skills/{name} — 仅自定义可删 */
export async function deleteSkill(name) {
  const { data } = await api.delete(`/skills/${encodeURIComponent(name)}`)
  return data
}
