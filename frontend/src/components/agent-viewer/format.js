export const MODE_LABEL = {
  router: 'Router',
  skill: 'Skill',
  chat: '闲聊',
  summary: '摘要',
}

export const SOURCE_LABEL = {
  explicit: '显式',
  router: 'Router',
}

export function formatRunTime(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function formatMs(ms) {
  const n = Number(ms) || 0
  if (n < 1000) return `${n} ms`
  return `${(n / 1000).toFixed(1)} s`
}

export function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toFixed(1)}%`
}

export function toolNames(tools) {
  if (!Array.isArray(tools)) return []
  return tools
    .map((tool) => {
      if (typeof tool === 'string') return tool.trim()
      if (tool && typeof tool === 'object') return String(tool.name || '').trim()
      return ''
    })
    .filter(Boolean)
}
