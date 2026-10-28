import { describe, expect, it } from 'vitest'
import { mapSessionDetail, mapSessionSummary } from './sessions'

describe('mapSessionDetail', () => {
  it('保留后端落盘的 thinking，供刷新后回显思考块', () => {
    const mapped = mapSessionDetail({
      id: 'sess_test',
      title: '测试会话',
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: '正文内容',
          thinking: '先观察再承接',
        },
        { id: 'm2', role: 'assistant', content: '无思考' },
      ],
    })

    expect(mapped.messages[0].thinking).toBe('先观察再承接')
    expect(mapped.messages[0].content).toBe('正文内容')
    expect(mapped.messages[0].charCount).toBe(4)
    // 旧消息没有该字段 → 空串，过程容器不渲染思考段
    expect(mapped.messages[1].thinking).toBe('')
  })
})

describe('mapSessionSummary', () => {
  it('重命名返回的摘要不覆盖已加载的消息，仅取标题等元数据', () => {
    const summary = mapSessionSummary({
      id: 'sess_test',
      title: '新标题',
      updated_at: 1_700_000_000_000,
      message_count: 6,
      status: 'idle',
    })

    expect(summary.title).toBe('新标题')
    expect(summary.updatedAt).toBe(1_700_000_000_000)
    // 摘要没有 messages，调用方只能拿它改标题
    expect(summary.messages).toEqual([])
  })
})
