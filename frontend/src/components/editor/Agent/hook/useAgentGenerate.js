import { useRef, useState } from 'react'
import { getErrorMessage } from '../../../../api/client'
import { runAgentGenerate } from '../service/generate'
import { QUICK_ACTIONS } from '../utils/constants'

export function useAgentGenerate({
  projectId,
  tempRules,
  chapterId,
  currentContent = '',
  selectedText = '',
  getSessionId,
  updateSessionById,
  setAiDraft,
  onInputClear,
}) {
  const [notice, setNotice] = useState('')
  const [generating, setGenerating] = useState(false)
  const abortRef = useRef(null)
  const lastRequestRef = useRef(null)

  const showNotice = (text) => {
    setNotice(text)
  }

  const handleStop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setGenerating(false)
    showNotice('已终止生成。')
    setAiDraft?.((d) =>
      d?.status === 'streaming' ? { ...d, status: 'ready' } : d,
    )
  }

  const handleTriggerGenerate = async (skillId, userText) => {
    const sessionId = getSessionId?.()
    if (!projectId || !sessionId) {
      showNotice('会话未就绪，请稍后重试。')
      return
    }

    const skill =
      QUICK_ACTIONS.find((q) => q.id === skillId) || QUICK_ACTIONS[0]
    const text = (userText || '').trim() || `使用「${skill.label}」`

    lastRequestRef.current = { skillId: skill.id, userText: text }

    // Optimistic local bubbles; server persists and returns meta ids.
    const localUserId = `m_local_u_${Date.now()}`
    const localAssistId = `m_local_a_${Date.now()}`
    let assistId = localAssistId
    let streamBuf = ''

    updateSessionById(sessionId, (s) => ({
      ...s,
      title: s.messages.length === 0 ? text.slice(0, 24) : s.title,
      messages: [
        ...s.messages,
        { id: localUserId, role: 'user', content: text },
        {
          id: localAssistId,
          role: 'assistant',
          skill: skill.label,
          content: '',
          pending: true,
        },
      ],
    }))
    onInputClear?.()
    setGenerating(true)
    setNotice('')
    setAiDraft?.({
      text: '',
      skill: skill.label,
      status: 'streaming',
    })

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const patchAssist = (patch) => {
      updateSessionById(sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistId || m.id === localAssistId ? { ...m, ...patch } : m,
        ),
      }))
    }

    try {
      const result = await runAgentGenerate({
        projectId,
        sessionId,
        skillName: skill.id,
        userInput: text,
        tempRules,
        chapterId,
        currentContent,
        selectedText,
        signal: controller.signal,
        onEvent: (ev) => {
          if (ev?.type === 'meta') {
            const serverAssist = ev.assistant_message_id
            const serverUser = ev.user_message_id
            if (serverAssist || serverUser) {
              updateSessionById(sessionId, (s) => ({
                ...s,
                messages: s.messages.map((m) => {
                  if (serverUser && m.id === localUserId) {
                    return { ...m, id: serverUser }
                  }
                  if (serverAssist && m.id === localAssistId) {
                    assistId = serverAssist
                    return { ...m, id: serverAssist }
                  }
                  return m
                }),
              }))
            }
          }
        },
        onDelta: (chunk) => {
          streamBuf += chunk
          patchAssist({ content: streamBuf, pending: true })
          setAiDraft?.({
            text: streamBuf,
            skill: skill.label,
            status: 'streaming',
          })
        },
      })

      const finalText = result.content || streamBuf
      if (result.error && finalText) {
        showNotice(result.error)
      }
      patchAssist({
        content: finalText,
        pending: true,
        error: result.error || '',
      })
      setAiDraft?.({
        text: finalText,
        skill: skill.label,
        status: 'ready',
      })
    } catch (err) {
      if (err?.name === 'AbortError') {
        patchAssist({
          content: streamBuf,
          pending: Boolean(streamBuf),
          error: streamBuf ? '' : '已中断',
        })
        if (streamBuf) {
          setAiDraft?.({
            text: streamBuf,
            skill: skill.label,
            status: 'ready',
          })
        } else {
          setAiDraft?.(null)
        }
      } else {
        const msg = getErrorMessage(err, '生成失败')
        showNotice(msg)
        patchAssist({
          content: streamBuf || msg,
          pending: false,
          error: msg,
        })
        setAiDraft?.(null)
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      setGenerating(false)
    }
  }

  const handleRetry = () => {
    const last = lastRequestRef.current
    if (!last || generating) {
      showNotice('暂无可重试的生成。')
      return
    }
    setAiDraft?.(null)
    handleTriggerGenerate(last.skillId, last.userText)
  }

  return {
    notice,
    setNotice,
    showNotice,
    generating,
    handleTriggerGenerate,
    handleStop,
    handleRetry,
    abortGenerate: handleStop,
  }
}
