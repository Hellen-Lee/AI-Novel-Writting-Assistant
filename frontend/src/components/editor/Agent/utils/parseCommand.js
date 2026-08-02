import { QUICK_ACTIONS } from './constants'

/**
 * 解析 Composer 输入中的 `/name` 技能调用。
 * @returns {{ skillId: string, userText: string, matched: boolean }}
 */
export function parseCommand(raw, fallbackSkillId) {
  const text = (raw || '').trim()
  const slash = text.match(/^\/([a-z0-9_-]+)\s*(.*)$/i)
  if (!slash) {
    return { skillId: fallbackSkillId, userText: text, matched: false }
  }

  const name = slash[1].toLowerCase()
  const mapped = QUICK_ACTIONS.find(
    (q) => q.id === name || q.id.replace('_', '-') === name,
  )
  if (!mapped) {
    return { skillId: fallbackSkillId, userText: text, matched: false }
  }

  return {
    skillId: mapped.id,
    userText: slash[2].trim() || `/${mapped.id}`,
    matched: true,
  }
}
