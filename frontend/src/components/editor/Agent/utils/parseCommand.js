import { QUICK_ACTIONS } from './constants'

const SLASH_NAME_RE =
  /^\/([\u4e00-\u9fffa-z0-9]+(?:[_-][\u4e00-\u9fffa-z0-9]+)*)\s*(.*)$/i

/**
 * 解析 Composer 输入中的 `/name` 技能调用。
 * @returns {{ skillId: string, userText: string, matched: boolean }}
 */
export function parseCommand(raw, fallbackSkillId) {
  const text = (raw || '').trim()
  const slash = text.match(SLASH_NAME_RE)
  if (!slash) {
    return { skillId: fallbackSkillId, userText: text, matched: false }
  }

  const name = slash[1]
  const mapped = QUICK_ACTIONS.find((q) => q.id === name)
  if (!mapped) {
    return { skillId: fallbackSkillId, userText: text, matched: false }
  }

  return {
    skillId: mapped.id,
    userText: slash[2].trim() || `/${mapped.id}`,
    matched: true,
  }
}
