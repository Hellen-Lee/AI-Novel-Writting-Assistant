import { AGENT_PHASE, TOOL_LABELS } from './constants'

/** 生成仍处于进行中（尚未到终态）的阶段 */
export const isInFlight = (phase) =>
  phase === AGENT_PHASE.THINKING ||
  phase === AGENT_PHASE.TOOL_CALL ||
  phase === AGENT_PHASE.STREAMING

export const toolLabel = (name) => TOOL_LABELS[name] || name || '工具'

/** ['read_recent_work','get_outline'] → '读取前文、读取大纲' */
export const toolLabels = (names = []) =>
  names.map(toolLabel).filter(Boolean).join('、')

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
