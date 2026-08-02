/** 字数展示：不足万用「字」，否则用「万字」 */
export function formatWordCount(count) {
  const n = Number(count) || 0
  if (n < 10000) return `${n.toLocaleString('zh-CN')} 字`
  const wan = n / 10000
  const text = wan >= 10 ? wan.toFixed(0) : wan.toFixed(1)
  return `${text.replace(/\.0$/, '')} 万字`
}

/** Hero 统计用的总字数（偏短） */
export function formatTotalWordsShort(count) {
  const n = Number(count) || 0
  if (n < 10000) return String(n)
  const wan = n / 10000
  const text = wan >= 10 ? wan.toFixed(0) : wan.toFixed(1)
  return `${text.replace(/\.0$/, '')} 万`
}

/** ISO 时间 → 相对时间文案 */
export function formatRelativeTime(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return '刚刚'

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}
