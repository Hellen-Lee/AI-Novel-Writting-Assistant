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

  it('draft_hint 到达即开草稿卡并落位，正文剥离首行声明哨兵', async () => {
    let session = { id: 'session_test', title: '测试会话', messages: [] }
    const drafts = []
    const updateSessionById = vi.fn((sessionId, updater) => {
      session = updater(session)
    })

    mocks.runAgentGenerate.mockImplementation(async ({ onEvent, onDelta }) => {
      onEvent({ type: 'meta', draft: false })
      // 模型在正文首行声明成稿 → 后端发 draft_hint（带锚），前端应立刻切草稿模式
      onEvent({
        type: 'draft_hint',
        draft: true,
        content_anchor: { mode: 'insert_after', startPara: 5, endPara: 5 },
      })
      onDelta('[[DRAFT|insert_after|5]]\n他抬起头。')
      return {
        content: '[[DRAFT|insert_after|5]]\n他抬起头。',
        meta: { draft: true },
        error: null,
      }
    })

    const { result } = renderHook(() =>
      useAgentGenerate({
        projectId: 'project_test',
        getSessionId: () => 'session_test',
        getModelId: () => 'model_test',
        updateSessionById,
        setAiDraft: (d) => drafts.push(d),
        onInputClear: vi.fn(),
      }),
    )

    await act(async () => {
      await result.current.handleTriggerGenerate(null, '接着往下写')
    })

    const assistant = session.messages.at(-1)
    expect(assistant.draftRound).toBe(true)
    expect(assistant.content).toBe('他抬起头。')
    expect(assistant.content).not.toContain('[[DRAFT')
    // 流式期间就应落位到第 5 段之后，而不是等末尾 meta
    expect(drafts.some((d) => d?.anchor?.startPara === 5)).toBe(true)
    expect(drafts.at(-1).text).not.toContain('[[DRAFT')
  })

  it('未声明成稿的超长回复不判为草稿，正文逐字透传', async () => {
    let session = { id: 'session_test', title: '测试会话', messages: [] }
    const drafts = []
    const review = '本章功能完整，但有三处硬伤：体量失衡、环节过密、钩子断了。'.repeat(30)
    const updateSessionById = vi.fn((sessionId, updater) => {
      session = updater(session)
    })

    mocks.runAgentGenerate.mockImplementation(async ({ onEvent, onDelta }) => {
      onEvent({ type: 'meta', draft: false })
      onDelta(review)
      return { content: review, meta: { draft: false }, error: null }
    })

    const { result } = renderHook(() =>
      useAgentGenerate({
        projectId: 'project_test',
        getSessionId: () => 'session_test',
        getModelId: () => 'model_test',
        updateSessionById,
        setAiDraft: (d) => drafts.push(d),
        onInputClear: vi.fn(),
      }),
    )

    await act(async () => {
      await result.current.handleTriggerGenerate(null, '评估这一章')
    })

    const assistant = session.messages.at(-1)
    expect(assistant.draftRound).toBe(false)
    expect(assistant.content).toBe(review)
    expect(drafts.at(-1)).toBeNull()
  })
})
