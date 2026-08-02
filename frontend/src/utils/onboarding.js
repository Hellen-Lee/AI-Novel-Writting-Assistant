const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 生成「第一卷」「第十一卷」等卷序标签 */
export function volumeLabelFromIndex(index) {
  const n = index + 1
  if (n <= 0) return '第零卷'
  if (n <= 10) return `第${n === 10 ? '十' : CN_DIGITS[n]}卷`
  if (n < 20) return `第十${n === 10 ? '' : CN_DIGITS[n - 10]}卷`
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return `第${CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ''}卷`
  }
  return `第${n}卷`
}

export function createLocalId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function countChars(text) {
  return Array.from(text || '').length
}

/** 故事内核 → meta.description */
export function formatStoryCoreDescription(core) {
  const theme = (core?.theme || '').trim()
  const conflict = (core?.conflict || '').trim()
  const plotline = (core?.plotline || '').trim()
  const lines = []
  if (theme) lines.push(`核心主题：${theme}`)
  if (conflict) lines.push(`核心冲突：${conflict}`)
  if (plotline) lines.push(`故事主线：${plotline}`)
  return lines.join('\n')
}

export function emptyCharacterDraft() {
  return {
    id: '',
    name: '',
    role: '',
    profile: '',
    relationship: [{ type: '', target: '' }],
  }
}

export function emptyVolumeDraft(index = 0) {
  return {
    id: '',
    label: volumeLabelFromIndex(index),
    name: '',
    summary: '',
  }
}
