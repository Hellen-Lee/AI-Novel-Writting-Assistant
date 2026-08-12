import { useRef, useState } from 'react'
import { getErrorMessage } from '../../../../api/client'
import { runAgentGenerate } from '../service/generate'
import { QUICK_ACTIONS } from '../utils/constants'

function resolveSkillLabel(skillId) {
  if (!skillId) return ''
  const q = QUICK_ACTIONS.find((item) => item.id === skillId)
  return q?.label || skillId
}

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

  /**
   * @param {string|null|undefined} skillId - null/undefined → auto Router
   * @param {string} userText
   */
  const handleTriggerGenerate = async (skillId, userText) => {
    const sessionId = getSessionId?.()
    if (!projectId || !sessionId) {
      showNotice('会话未就绪，请稍后重试。')
      return
    }

    const explicitSkill = skillId || null
    const text =
      (userText || '').trim() ||
      (explicitSkill ? `使用「${resolveSkillLabel(explicitSkill)}」` : '')
    if (!text) {
      showNotice('请输入内容，或点击快捷指令。')
      return
    }

    lastRequestRef.current = { skillId: explicitSkill, userText: text }

    const localUserId = `m_local_u_${Date.now()}`
    const localAssistId = `m_local_a_${Date.now()}`
    let assistId = localAssistId
    let streamBuf = ''
    let mode = explicitSkill ? 'skill' : 'chat'
    let skillLabel = explicitSkill ? resolveSkillLabel(explicitSkill) : '闲聊'

    updateSessionById(sessionId, (s) => ({
      ...s,
      title: s.messages.length === 0 ? text.slice(0, 24) : s.title,
      messages: [
        ...s.messages,
        { id: localUserId, role: 'user', content: text },
        {
          id: localAssistId,
          role: 'assistant',
          skill: skillLabel,
          content: '',
          pending: true,
        },
      ],
    }))
    onInputClear?.()
    setGenerating(true)
    setNotice('')

    // Only open draft card for explicit skill; auto mode waits for meta.mode
    if (explicitSkill) {
      setAiDraft?.({
        text: '',
        skill: skillLabel,
        status: 'streaming',
      })
    } else {
      setAiDraft?.(null)
    }

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

    const syncDraft = (chunkText, status) => {
      if (mode !== 'skill') {
        setAiDraft?.(null)
        return
      }
      setAiDraft?.({
        text: chunkText,
        skill: skillLabel,
        status,
      })
    }

    try {
      const result = await runAgentGenerate({
        projectId,
        sessionId,
        skillName: explicitSkill || undefined,
        userInput: text,
        tempRules,
        chapterId,
        currentContent,
        selectedText,
        signal: controller.signal,
        onEvent: (ev) => {
          if (ev?.type === 'router_meta') {
            const decision = ev.decision || 'chat'
            if (decision === 'skill' && ev.skill_name) {
              skillLabel = resolveSkillLabel(ev.skill_name)
              mode = 'skill'
              patchAssist({ skill: skillLabel })
              showNotice(`已选用技能：${skillLabel}`)
              setAiDraft?.({
                text: streamBuf,
                skill: skillLabel,
                status: 'streaming',
              })
            } else if (decision === 'clarify') {
              mode = 'chat'
              skillLabel = '澄清'
              patchAssist({ skill: skillLabel })
              setAiDraft?.(null)
            } else {
              mode = 'chat'
              skillLabel = '闲聊'
              patchAssist({ skill: skillLabel })
              setAiDraft?.(null)
            }
            return
          }
          if (ev?.type === 'meta') {
            if (ev.mode === 'skill') {
              mode = 'skill'
              if (ev.skill_name) {
                skillLabel = resolveSkillLabel(ev.skill_name)
              }
              patchAssist({ skill: skillLabel })
              if (!streamBuf) {
                setAiDraft?.({
                  text: '',
                  skill: skillLabel,
                  status: 'streaming',
                })
              }
            } else {
              mode = 'chat'
              if (!skillLabel || skillLabel === '闲聊') {
                skillLabel = ev.skill_name
                  ? resolveSkillLabel(ev.skill_name)
                  : '闲聊'
              }
              patchAssist({ skill: skillLabel, pending: true })
              setAiDraft?.(null)
            }
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
                    return { ...m, id: serverAssist, skill: skillLabel }
                  }
                  return m
                }),
              }))
            }
          }
        },
        onDelta: (chunk) => {
          streamBuf += chunk
          patchAssist({
            content: streamBuf,
            pending: mode === 'skill',
            skill: skillLabel,
          })
          syncDraft(streamBuf, 'streaming')
        },
      })

      const finalText = result.content || streamBuf
      if (result.error && finalText) {
        showNotice(result.error)
      }
      const finalMode = result.meta?.mode || mode
      mode = finalMode
      if (result.meta?.skill_name) {
        skillLabel = resolveSkillLabel(result.meta.skill_name)
      } else if (finalMode === 'chat' && skillLabel !== '澄清') {
        skillLabel = skillLabel || '闲聊'
      }

      patchAssist({
        content: finalText,
        pending: finalMode === 'skill',
        skill: skillLabel,
        error: result.error || '',
      })
      if (finalMode === 'skill') {
        setAiDraft?.({
          text: finalText,
          skill: skillLabel,
          status: 'ready',
        })
      } else {
        setAiDraft?.(null)
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        patchAssist({
          content: streamBuf,
          pending: mode === 'skill' && Boolean(streamBuf),
          error: streamBuf ? '' : '已中断',
          skill: skillLabel,
        })
        if (mode === 'skill' && streamBuf) {
          setAiDraft?.({
            text: streamBuf,
            skill: skillLabel,
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
          skill: skillLabel,
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
