import { describe, expect, it } from 'vitest'
import {
  filterSessionsByTitle,
  groupSessionsByTime,
  resolveGroupKey,
} from './historyGroups'

const DAY = 24 * 60 * 60 * 1000
// 2026-10-27 10:00 本地时间
const now = new Date(2026, 9, 27, 10, 0, 0).getTime()

describe('resolveGroupKey', () => {
  it('同一天归今天，含当天凌晨', () => {
    expect(resolveGroupKey(now, now)).toBe('today')
    expect(resolveGroupKey(new Date(2026, 9, 27, 0, 0, 1).getTime(), now)).toBe(
      'today',
    )
  })

  it('昨天到 6 天前归近 7 天', () => {
    expect(resolveGroupKey(now - DAY, now)).toBe('week')
    expect(resolveGroupKey(now - 6 * DAY, now)).toBe('week')
  })

  it('7 天前及更早归更早', () => {
    expect(resolveGroupKey(now - 7 * DAY, now)).toBe('older')
    expect(resolveGroupKey(new Date(2020, 0, 1).getTime(), now)).toBe('older')
  })

  it('缺失或非法时间戳归更早，未来时间归今天', () => {
    expect(resolveGroupKey(undefined, now)).toBe('older')
    expect(resolveGroupKey(0, now)).toBe('older')
    expect(resolveGroupKey(now + DAY, now)).toBe('today')
  })
})

describe('groupSessionsByTime', () => {
  it('按今天 / 近 7 天 / 更早分组，并剔除空分组', () => {
    const groups = groupSessionsByTime(
      [
        { id: 'a', title: '最新', updatedAt: now },
        { id: 'b', title: '三天前', updatedAt: now - 3 * DAY },
        { id: 'c', title: '上个月', updatedAt: now - 40 * DAY },
      ],
      now,
    )

    expect(groups.map((g) => g.label)).toEqual(['今天', '近 7 天', '更早'])
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['a'])
    expect(groups[1].sessions.map((s) => s.id)).toEqual(['b'])
    expect(groups[2].sessions.map((s) => s.id)).toEqual(['c'])
  })

  it('只有一组数据时只返回该组', () => {
    const groups = groupSessionsByTime([{ id: 'a', updatedAt: now }], now)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('today')
  })

  it('空输入返回空数组', () => {
    expect(groupSessionsByTime([], now)).toEqual([])
  })
})

describe('filterSessionsByTitle', () => {
  const sessions = [
    { id: 'a', title: '青灯人出场续写' },
    { id: 'b', title: '润色第三章开场' },
    { id: 'c', title: 'Chapter One' },
  ]

  it('按标题子串过滤，忽略大小写', () => {
    expect(filterSessionsByTitle(sessions, '青灯').map((s) => s.id)).toEqual(['a'])
    expect(filterSessionsByTitle(sessions, 'chapter').map((s) => s.id)).toEqual([
      'c',
    ])
  })

  it('空白关键词返回原列表', () => {
    expect(filterSessionsByTitle(sessions, '   ')).toBe(sessions)
    expect(filterSessionsByTitle(sessions, '')).toBe(sessions)
  })

  it('无命中返回空数组', () => {
    expect(filterSessionsByTitle(sessions, '不存在的标题')).toEqual([])
  })
})
