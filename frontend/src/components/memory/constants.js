export const MEMORY_CATEGORIES = [
  { key: 'worldview', label: '世界观', keyHint: 'worldview' },
  { key: 'story_core', label: '故事内核', keyHint: 'story_core' },
  { key: 'characters', label: '人物', keyHint: 'characters' },
  { key: 'outline', label: '全本大纲', keyHint: 'outline', isOutline: true },
]

export const EMPTY_MEMORY = {
  worldview: [],
  characters: [],
  story_core: [],
}

export const DEFAULT_ENTRY_NAME = {
  worldview: '未命名设定',
  characters: '未命名人物',
  story_core: '未命名内核',
}

export const GENRE_PRESETS = ['玄幻', '仙侠', '都市', '科幻', '悬疑']

export const PRIMARY_WORLDVIEW_NAME = '世界观'

export function getCategoryMeta(key) {
  return MEMORY_CATEGORIES.find((c) => c.key === key) || MEMORY_CATEGORIES[0]
}

export function isCharacterCategory(category) {
  return category === 'characters'
}

export function isOutlineCategory(category) {
  return category === 'outline'
}

export function isMemoryCategory(category) {
  return category === 'worldview' || category === 'story_core' || category === 'characters'
}

/** 列表/卡片摘要：人物用 profile + 关系；其它用 content */
export function entrySnippet(category, entry) {
  if (isCharacterCategory(category)) {
    const profile = (entry.profile || '').trim()
    const rels = (entry.relationship || [])
      .filter((r) => r.type && r.target)
      .slice(0, 2)
      .map((r) => `${r.type} → ${r.target}`)
      .join('；')
    const parts = []
    if (profile) parts.push(truncate(profile, 80))
    if (rels) parts.push(`关系：${rels}`)
    return parts.join('\n') || '暂无简介'
  }
  return truncate((entry.content || '').trim(), 120) || '暂无内容'
}

export function entryRoleLabel(entry) {
  return (entry.tags && entry.tags[0]) || ''
}

export function characterSubtitle(entry) {
  const rest = (entry.tags || []).slice(1).filter(Boolean)
  if (rest.length) return rest.join(' · ')
  const profile = (entry.profile || '').trim()
  if (!profile) return ''
  const firstLine = profile.split(/\n/)[0]
  return truncate(firstLine, 24)
}

export function splitWorldviewEntries(entries) {
  const list = entries || []
  const primary = list.find((e) => e.name === PRIMARY_WORLDVIEW_NAME) || null
  const secondary = list.filter((e) => e.name !== PRIMARY_WORLDVIEW_NAME)
  return { primary, secondary }
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

export function toolbarCountLabel(category, memory, outline) {
  if (category === 'outline') {
    const volCount = (outline?.volumes || []).length
    const hasSynopsis = Boolean((outline?.synopsis || '').trim())
    return `${hasSynopsis ? 1 : 0} 概要 · ${volCount} 卷`
  }
  const count = (memory[category] || []).length
  if (category === 'worldview') return `${Math.max(count, 0)} 组设定`
  if (category === 'story_core') return `${count} 项内核`
  return `${count} 条设定`
}

export function createButtonLabel(category) {
  if (category === 'characters') return '新建人物'
  if (category === 'story_core') return '新建内核'
  if (category === 'outline') return '添加分卷'
  if (category === 'worldview') return '新建设定'
  return '新建'
}

function truncate(text, max) {
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
