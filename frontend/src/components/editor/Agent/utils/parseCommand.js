import { QUICK_ACTIONS } from './constants'

const SLASH_NAME_RE =
  /^\/([\u4e00-\u9fffa-z0-9]+(?:[_-][\u4e00-\u9fffa-z0-9]+)*)\s*(.*)$/i

/**
 * 解析 Composer 输入中的 `/name` 技能调用。
 * 未匹配 `/` 时 skillId 为 null（走后端 Router / 闲聊）。
 * @returns {{ skillId: string|null, userText: string, matched: boolean, label: string }}
 */
export function parseCommand(raw) {
  const text = (raw || '').trim()
  const slash = text.match(SLASH_NAME_RE)
  if (!slash) {
    return { skillId: null, userText: text, matched: false, label: '' }
  }

  const name = slash[1]
  const mapped = QUICK_ACTIONS.find((q) => q.id === name)
  return {
    skillId: mapped?.id || name,
    userText: slash[2].trim() || `/${mapped?.id || name}`,
    matched: true,
    label: mapped?.label || name,
  }
}
