/**
 * 历史会话的时间归档与标题过滤（纯函数，便于单测）。
 * 设计对照：OckRz 的 Group/今天 · 昨天 · 更早；
 * 实际按「今天 / 近 7 天 / 更早」三分组，空分组不渲染。
 */
export const HISTORY_GROUPS = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '近 7 天' },
  { key: 'older', label: '更早' },
]

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date) {
  const copy = new Date(date.getTime())
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

/** 按日历天差分组：0 → 今天，1~6 → 近 7 天，其余/非法 → 更早 */
export function resolveGroupKey(updatedAt, now = Date.now()) {
  const time = Number(updatedAt)
  if (!Number.isFinite(time) || time <= 0) return 'older'
  const days = Math.round(
    (startOfDay(new Date(now)) - startOfDay(new Date(time))) / DAY_MS,
  )
  if (days <= 0) return 'today'
  if (days <= 6) return 'week'
  return 'older'
}

/** 非空分组数组（保持 HISTORY_GROUPS 的顺序） */
export function groupSessionsByTime(sessions = [], now = Date.now()) {
  const buckets = new Map(HISTORY_GROUPS.map((g) => [g.key, []]))
  for (const session of sessions) {
    buckets.get(resolveGroupKey(session?.updatedAt, now))?.push(session)
  }
  return HISTORY_GROUPS.map((group) => ({
    ...group,
    sessions: buckets.get(group.key) || [],
  })).filter((group) => group.sessions.length > 0)
}

/** 按标题忽略大小写过滤；关键词为空时原样返回 */
export function filterSessionsByTitle(sessions = [], keyword = '') {
  const query = String(keyword || '').trim().toLowerCase()
  if (!query) return sessions
  return sessions.filter((s) =>
    String(s?.title || '').toLowerCase().includes(query),
  )
}
