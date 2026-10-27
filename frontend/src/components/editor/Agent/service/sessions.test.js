import { describe, expect, it } from 'vitest'
import { mapSessionDetail } from './sessions'

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
