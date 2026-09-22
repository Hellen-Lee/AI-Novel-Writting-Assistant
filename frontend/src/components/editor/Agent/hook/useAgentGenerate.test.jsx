import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT_PHASE } from '../utils/constants'

const mocks = vi.hoisted(() => ({
  runAgentGenerate: vi.fn(),
}))

vi.mock('../service/generate', () => ({
  runAgentGenerate: mocks.runAgentGenerate,
}))

import { useAgentGenerate } from './useAgentGenerate'

describe('useAgentGenerate thinking 透传', () => {
  beforeEach(() => {
    mocks.runAgentGenerate.mockReset()
  })

  it('累积 thinking 到消息但不污染正文，并保持阶段顺序', async () => {
    let session = {
      id: 'session_test',
      title: '测试会话',
      messages: [],
    }
    let phaseWhenThinking = ''
    const updateSessionById = vi.fn((sessionId, updater) => {
      expect(sessionId).toBe('session_test')
      session = updater(session)
    })

    mocks.runAgentGenerate.mockImplementation(async ({ onEvent, onDelta }) => {
      onEvent({ type: 'meta', draft: false })
      onEvent({ type: 'thinking', text: '先分析。' })
      phaseWhenThinking = session.messages.at(-1).phase
      onEvent({ type: 'thinking', text: '再组织。' })
      onDelta('正文内容')
      return {
        content: '正文内容',
        meta: { draft: false },
        error: null,
      }
    })

    const { result } = renderHook(() =>
      useAgentGenerate({
        projectId: 'project_test',
        getSessionId: () => 'session_test',
        getModelId: () => 'model_test',
        updateSessionById,
        setAiDraft: vi.fn(),
        onInputClear: vi.fn(),
      }),
    )

    await act(async () => {
      await result.current.handleTriggerGenerate(null, '测试输入')
    })

    const assistant = session.messages.at(-1)
    expect(phaseWhenThinking).toBe(AGENT_PHASE.THINKING)
    expect(assistant.thinking).toBe('先分析。再组织。')
    expect(assistant.content).toBe('正文内容')
    expect(assistant.thinking).not.toContain(assistant.content)
    expect(assistant.phase).toBe(AGENT_PHASE.DONE)
  })
})
