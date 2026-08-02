import { useRef, useState } from 'react'
import { runAgentGenerate } from '../service/generate'
import { AI_PLACEHOLDER, QUICK_ACTIONS } from '../utils/constants'

export function useAgentGenerate({
  projectId,
  tempRules,
  updateActiveSession,
  onInputClear,
}) {
  const [notice, setNotice] = useState('')
  const [generating, setGenerating] = useState(false)
  const abortRef = useRef(null)

  const showNotice = (text) => {
    setNotice(text)
  }

  const handleTriggerGenerate = async (skillId, userText) => {
    const skill =
      QUICK_ACTIONS.find((q) => q.id === skillId) || QUICK_ACTIONS[0]
    const text = (userText || '').trim() || `使用「${skill.label}」`

    updateActiveSession((s) => ({
      ...s,
      title: s.messages.length === 0 ? text.slice(0, 24) : s.title,
      messages: [
        ...s.messages,
        { id: `m_${Date.now()}_u`, role: 'user', content: text },
        {
          id: `m_${Date.now()}_a`,
          role: 'assistant',
          skill: skill.label,
          content: AI_PLACEHOLDER,
          pending: true,
        },
      ],
    }))
    onInputClear?.()
    setGenerating(true)
    showNotice(AI_PLACEHOLDER)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await runAgentGenerate({
        projectId,
        skillName: skill.id,
        userInput: text,
        tempRules,
        signal: controller.signal,
      })
    } catch (err) {
      if (err?.name !== 'AbortError') {
        showNotice(err?.message || '生成失败')
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      setGenerating(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setGenerating(false)
    showNotice('已终止（界面预览；真实中断将在生成链路接入）。')
  }

  const handleRetry = () => {
    showNotice(AI_PLACEHOLDER)
  }

  return {
    notice,
    setNotice,
    showNotice,
    generating,
    handleTriggerGenerate,
    handleStop,
    handleRetry,
  }
}
