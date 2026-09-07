import { AGENT_PHASE, TOOL_LABELS } from './constants'

/** 生成仍处于进行中（尚未到终态）的阶段 */
export const isInFlight = (phase) =>
  phase === AGENT_PHASE.THINKING ||
  phase === AGENT_PHASE.TOOL_CALL ||
  phase === AGENT_PHASE.STREAMING

/** 工具调用进行中（ing）：阶段停在 tool_call 时，工具名文案呈波浪态 */
export const isToolCalling = (phase) => phase === AGENT_PHASE.TOOL_CALL

export const toolLabel = (name) => TOOL_LABELS[name] || name || '工具'

/** ['read_recent_work','get_outline'] → '读取前文、读取大纲' */
export const toolLabels = (names = []) =>
  names.map(toolLabel).filter(Boolean).join('、')

/** 兼容 string | object 的工具调用 arguments */
export function normalizeToolArgs(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {}
    } catch {
      return {}
    }
  }
  return raw
}

/** 单条工具调用的中文参数摘要（默认收起，点击展开用） */
export function toolArgSummary(name, args = {}) {
  switch (name) {
    case 'read_chapter':
      return (
        `章节 ${args.chapter_id ?? '—'}` +
        `${args.offset ? `，偏移 ${args.offset}` : ''}` +
        `${args.limit ? `，长度 ${args.limit}` : ''}`
      )
    case 'read_recent_work':
      return `最近 ${args.n ?? 3} 章`
    case 'get_outline':
      return '（无参数）'
    case 'search_memory':
      return (
        `关键词「${args.keyword ?? '—'}」` +
        `${args.category ? ` · ${args.category}` : ''}`
      )
    default:
      return ''
  }
}

/** 写作轮气泡折叠提示文案 */
export function draftNoticeText({ phase, charCount = 0, pending = false }) {
  if (phase === AGENT_PHASE.STREAMING) {
    return `正在生成续写…已 ${charCount} 字`
  }
  if (phase === AGENT_PHASE.STOPPED) {
    return `已终止，保留 ${charCount} 字草稿在编辑区`
  }
  if (phase === AGENT_PHASE.ERROR) {
    return `生成出错，编辑区未更新`
  }
  if (!pending) {
    return `已生成约 ${charCount} 字续写，已处理`
  }
  return `已生成约 ${charCount} 字续写，已放入编辑区，确认后即转为正文`
}
