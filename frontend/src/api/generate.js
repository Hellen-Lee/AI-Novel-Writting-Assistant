/**
 * POST /projects/:id/generate — consume SSE stream.
 * Events: router_meta | meta | content | error | [DONE]  (ask reserved)
 */

function parseSseChunk(block) {
  const lines = block.split(/\r?\n/)
  const dataLines = []
  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (!dataLines.length) return null
  return dataLines.join('\n')
}

/**
 * @param {object} opts
 * @param {string} opts.projectId
 * @param {object} opts.body - GenerateRequest fields
 * @param {AbortSignal} [opts.signal]
 * @param {(ev: object) => void} [opts.onEvent]
 * @returns {Promise<{ content: string, meta: object|null, routerMeta: object|null, error: string|null }>}
 */
export async function streamGenerate({
  projectId,
  body,
  signal,
  onEvent,
}) {
  const response = await fetch(`/api/projects/${projectId}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    let detail = `生成失败 (${response.status})`
    try {
      const data = await response.json()
      if (typeof data?.detail === 'string' && data.detail.trim()) {
        detail = data.detail
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('浏览器不支持流式响应')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let meta = null
  let routerMeta = null
  let error = null

  const handleData = (raw) => {
    if (!raw) return
    if (raw === '[DONE]') return
    let ev
    try {
      ev = JSON.parse(raw)
    } catch {
      return
    }
    if (!ev || typeof ev !== 'object') return

    const type =
      ev.type ||
      (ev.content != null ? 'content' : ev.error != null ? 'error' : null)

    if (type === 'router_meta') {
      routerMeta = ev
      onEvent?.(ev)
      return
    }
    if (type === 'meta') {
      meta = ev
      onEvent?.(ev)
      return
    }
    if (type === 'content' || (ev.content != null && !ev.error)) {
      const chunk = String(ev.content ?? '')
      content += chunk
      onEvent?.({ type: 'content', content: chunk })
      return
    }
    if (type === 'error' || ev.error != null) {
      error = String(ev.error || '生成失败')
      onEvent?.({ type: 'error', error })
      return
    }
    if (type === 'ask') {
      onEvent?.(ev)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n\r?\n/)
    buffer = parts.pop() || ''
    for (const block of parts) {
      const data = parseSseChunk(block)
      if (data != null) handleData(data)
    }
  }

  if (buffer.trim()) {
    const data = parseSseChunk(buffer)
    if (data != null) handleData(data)
  }

  return { content, meta, routerMeta, error }
}
