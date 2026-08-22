export const MODE_LABEL = {
  router: 'Router',
  skill: 'Skill',
  chat: '闲聊',
  summary: '摘要',
  agent: 'Agent',
  agent_tool: '工具调用',
}

export const SOURCE_LABEL = {
  explicit: '命令指定',
  router: '自动选择',
}

export const NONE_SESSION_ID = '__none__'

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

export function previewText(text, max = 72) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!value) return ''
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
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
