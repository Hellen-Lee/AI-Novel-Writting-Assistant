import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamGenerate } from './generate'

function streamResponse(chunks) {
  let index = 0
  return {
    ok: true,
    body: {
      getReader() {
        return {
          read: async () => {
            if (index >= chunks.length) {
              return { done: true, value: undefined }
            }
            const value = new TextEncoder().encode(chunks[index])
            index += 1
            return { done: false, value }
          },
        }
      },
    },
  }
}

describe('streamGenerate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('透传 thinking 事件且不把思考内容累积到正文', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        'data: {"type":"thinking","text":"先想"}\n\n' +
          'data: {"type":"thinking","text":"后写"}\n',
        '\ndata: {"type":"content","content":"正文"}\n\n' +
          'data: [DONE]\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const events = []

    const result = await streamGenerate({
      projectId: 'project_test',
      body: { session_id: 'session_test', user_input: '测试' },
      onEvent: (event) => events.push(event),
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(events).toEqual([
      { type: 'thinking', text: '先想' },
      { type: 'thinking', text: '后写' },
      { type: 'content', content: '正文' },
    ])
    expect(result.content).toBe('正文')
    expect(result.error).toBeNull()
  })

  it('保留可选的 thinking source 供后续 plan 段使用', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        streamResponse([
          'data: {"type":"thinking","text":"创作思路","source":"plan"}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    )
    const events = []

    await streamGenerate({
      projectId: 'project_test',
      body: { session_id: 'session_test', user_input: '测试' },
      onEvent: (event) => events.push(event),
    })

    expect(events).toEqual([
      { type: 'thinking', text: '创作思路', source: 'plan' },
    ])
  })
})
