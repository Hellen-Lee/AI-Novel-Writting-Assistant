import { useRef, useState } from 'react'
import { getErrorMessage } from '../../../../api/client'
import { countWords } from '../../../../utils/format'
import { runAgentGenerate } from '../service/generate'
import { AGENT_PHASE, QUICK_ACTIONS } from '../utils/constants'
import { isInFlight } from '../utils/phase'

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
  getModelId,
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
    setAiDraft?.((d) => {
      if (!d || d.status !== 'streaming') return d
      return { ...d, status: 'ready', stopped: true, phase: AGENT_PHASE.STOPPED }
    })
  }

  /**
   * @param {string|null|undefined} skillId - null/undefined → unified agentic path
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
    let draftMode = false
    let draftResolved = false
    let skillLabel = explicitSkill ? resolveSkillLabel(explicitSkill) : ''
    let charCount = 0
    let phaseRef = AGENT_PHASE.THINKING

    const patchAssist = (patch) => {
      updateSessionById(sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistId || m.id === localAssistId ? { ...m, ...patch } : m,
        ),
      }))
    }

    const setPhase = (phase) => {
      phaseRef = phase
      patchAssist({ phase })
    }

    const syncDraft = (chunkText, status, extra = {}) => {
      if (!draftMode) {
        setAiDraft?.(null)
        return
      }
      setAiDraft?.({
        text: chunkText,
        skill: skillLabel,
        status,
        phase: phaseRef,
        ...extra,
      })
    }

    const initialMsg = {
      id: localAssistId,
      role: 'assistant',
      skill: skillLabel,
      content: '',
      pending: true,
      phase: AGENT_PHASE.THINKING,
      tools: [],
      charCount: 0,
      draftRound: false,
    }

    updateSessionById(sessionId, (s) => ({
      ...s,
      title: s.messages.length === 0 ? text.slice(0, 24) : s.title,
      messages: [
        ...s.messages,
        { id: localUserId, role: 'user', content: text },
        initialMsg,
      ],
    }))
    onInputClear?.()
    setGenerating(true)
    setNotice('')

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

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
        model: getModelId?.() || undefined,
        signal: controller.signal,
        onEvent: (ev) => {
          if (ev?.type === 'meta') {
            if (!draftResolved) {
              draftResolved = Boolean(ev.preset || ev.skill_name)
            }
            if (typeof ev.draft === 'boolean') {
              draftMode = ev.draft
            }
            if (ev.preset || ev.skill_name) {
              skillLabel = resolveSkillLabel(ev.preset || ev.skill_name)
            }
            if (!draftMode) {
              skillLabel = skillLabel || '闲聊'
            }
            patchAssist({ skill: skillLabel, pending: draftMode, draftRound: draftMode })
            if (draftMode) {
              syncDraft(streamBuf, 'streaming')
            } else {
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
          } else if (ev?.type === 'tool_progress') {
            const names = Array.isArray(ev.tools)
              ? ev.tools.map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
              : []
            setPhase(AGENT_PHASE.TOOL_CALL)
            patchAssist({ tools: names })
            syncDraft(streamBuf, 'streaming')
          } else if (ev?.type === 'error') {
            setPhase(AGENT_PHASE.ERROR)
            patchAssist({ error: ev.error || '' })
          }
        },
        onDelta: (chunk) => {
          streamBuf += chunk
          if (phaseRef === AGENT_PHASE.THINKING || phaseRef === AGENT_PHASE.TOOL_CALL) {
            setPhase(AGENT_PHASE.STREAMING)
            patchAssist({ tools: [] })
          }
          charCount += countWords(chunk)
          patchAssist({
            content: streamBuf,
            pending: draftMode,
            skill: skillLabel,
            charCount,
          })
          syncDraft(streamBuf, 'streaming')
        },
      })

      const finalText = result.content || streamBuf
      if (result.error && finalText) {
        showNotice(result.error)
      }
      if (typeof result.meta?.draft === 'boolean') {
        draftMode = result.meta.draft
      }
      if (result.meta?.preset || result.meta?.skill_name) {
        skillLabel = resolveSkillLabel(result.meta.preset || result.meta.skill_name)
      } else if (!draftMode) {
        skillLabel = skillLabel || '闲聊'
      }
      const finalPhase = result.error ? AGENT_PHASE.ERROR : AGENT_PHASE.DONE
      phaseRef = finalPhase
      patchAssist({
        content: finalText,
        pending: draftMode,
        skill: skillLabel,
        error: result.error || '',
        phase: finalPhase,
        draftRound: draftMode,
        charCount: countWords(finalText),
      })
      if (draftMode) {
        setAiDraft?.({
          text: finalText,
          skill: skillLabel,
          status: 'ready',
          phase: finalPhase,
          stopped: Boolean(result.error),
        })
      } else {
        setAiDraft?.(null)
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        phaseRef = AGENT_PHASE.STOPPED
        patchAssist({
          content: streamBuf,
          pending: draftMode && Boolean(streamBuf),
          error: streamBuf ? '' : '已中断',
          skill: skillLabel,
          phase: AGENT_PHASE.STOPPED,
          draftRound: draftMode,
          charCount,
        })
        if (draftMode && streamBuf) {
          setAiDraft?.({
            text: streamBuf,
            skill: skillLabel,
            status: 'ready',
            phase: AGENT_PHASE.STOPPED,
            stopped: true,
          })
        } else {
          setAiDraft?.(null)
        }
      } else {
        const msg = getErrorMessage(err, '生成失败')
        showNotice(msg)
        phaseRef = AGENT_PHASE.ERROR
        patchAssist({
          content: streamBuf || msg,
          pending: false,
          error: msg,
          skill: skillLabel,
          phase: AGENT_PHASE.ERROR,
          draftRound: draftMode,
          charCount,
        })
        setAiDraft?.(null)
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      // 兜底复位：任何异常路径若仍停在进行态，统一收束为 done，避免永久“思考中”
      if (isInFlight(phaseRef)) {
        patchAssist({ phase: AGENT_PHASE.DONE })
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
