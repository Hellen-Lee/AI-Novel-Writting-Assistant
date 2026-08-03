export const MEMORY_CATEGORIES = [
  { key: 'worldview', label: '世界观', keyHint: 'worldview' },
  { key: 'characters', label: '人物', keyHint: 'characters' },
  { key: 'items', label: '物品', keyHint: 'items' },
  { key: 'plot_points', label: '剧情要点', keyHint: 'plot_points' },
]

export const EMPTY_MEMORY = {
  worldview: [],
  characters: [],
  items: [],
  plot_points: [],
}

export const DEFAULT_ENTRY_NAME = {
  worldview: '未命名世界观',
  characters: '未命名人物',
  items: '未命名物品',
  plot_points: '未命名要点',
}

export function getCategoryMeta(key) {
  return MEMORY_CATEGORIES.find((c) => c.key === key) || MEMORY_CATEGORIES[0]
}

export function isCharacterCategory(category) {
  return category === 'characters'
}

/** 列表摘要：人物用 profile + 关系；其它用 content */
export function entrySnippet(category, entry) {
  if (isCharacterCategory(category)) {
    const profile = (entry.profile || '').trim()
    const rels = (entry.relationship || [])
      .filter((r) => r.type && r.target)
      .slice(0, 2)
      .map((r) => `${r.type} → ${r.target}`)
      .join('；')
    const parts = []
    if (profile) parts.push(truncate(profile, 36))
    if (rels) parts.push(`关系：${rels}`)
    return parts.join('\n') || '暂无简介'
  }
  return truncate((entry.content || '').trim(), 48) || '暂无内容'
}

export function entryRoleLabel(entry) {
  return (entry.tags && entry.tags[0]) || ''
}

export function entryToDraft(category, entry) {
  if (!entry) return null
  if (isCharacterCategory(category)) {
    return {
      id: entry.id,
      name: entry.name || '',
      role: entryRoleLabel(entry),
      profile: entry.profile || '',
      relationship: (entry.relationship || []).map((r) => ({
        type: r.type || '',
        target: r.target || '',
      })),
      updated_at: entry.updated_at || '',
    }
  }
  return {
    id: entry.id,
    name: entry.name || '',
    tagsText: (entry.tags || []).join('，'),
    content: entry.content || '',
    updated_at: entry.updated_at || '',
  }
}

export function draftToPayload(category, draft) {
  if (isCharacterCategory(category)) {
    const role = (draft.role || '').trim()
    return {
      name: (draft.name || '').trim(),
      profile: (draft.profile || '').trim(),
      relationship: (draft.relationship || [])
        .map((r) => ({
          type: (r.type || '').trim(),
          target: (r.target || '').trim(),
        }))
        .filter((r) => r.type && r.target),
      tags: role ? [role] : [],
    }
  }
  return {
    name: (draft.name || '').trim(),
    content: (draft.content || '').trim(),
    tags: String(draft.tagsText || '')
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
  }
}

function truncate(text, max) {
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
