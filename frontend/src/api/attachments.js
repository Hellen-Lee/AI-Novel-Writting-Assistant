import { api } from './client'

/** POST /api/projects/:id/agent/attachments — 批量上传附件 */
export async function uploadAttachments(projectId, sessionId, files) {
  const form = new FormData()
  form.append('session_id', sessionId)
  files.forEach((file) => form.append('files', file))

  const { data } = await api.post(
    `/projects/${encodeURIComponent(projectId)}/agent/attachments`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

/** DELETE /api/projects/:id/agent/attachments/:att_id — 删除未发送附件 */
export async function deleteAttachment(projectId, sessionId, attachmentId) {
  await api.delete(
    `/projects/${encodeURIComponent(projectId)}/agent/attachments/${encodeURIComponent(attachmentId)}`,
    { params: { session_id: sessionId } },
  )
}

export function attachmentThumbUrl(projectId, sessionId, attachmentId) {
  const params = new URLSearchParams({ session_id: sessionId })
  return `/api/projects/${encodeURIComponent(projectId)}/agent/attachments/${encodeURIComponent(attachmentId)}/thumb?${params}`
}
