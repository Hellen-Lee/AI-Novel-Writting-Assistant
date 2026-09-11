import { useRef, useState } from 'react'
import { getErrorMessage } from '../../../../api/client'
import { countWords } from '../../../../utils/format'
import {
  parseAnchorSentinel,
  stripAnchorSentinel,
} from '../../../../utils/paragraphs'
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
  contentAnchor = null, // 请求发起时用户选区的目标段落区间（可为 null）
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

    // 请求发起时刻的快照锚：若此刻用户在正文有选区，则本次草稿以该区间为落点
    // （请求期间选区变化不影响本次锚定）。
    const reqAnchor = contentAnchor || null
    // 后端回传的最终锚（模型哨兵优先于选区锚）。meta 到达后填充。
    let resolvedAnchor = reqAnchor

    const localUserId = `m_local_u_${Date.now()}`
    const localAssistId = `m_local_a_${Date.now()}`
    let assistId = localAssistId
    let streamBuf = ''
    let draftMode = false
    let draftResolved = false
    let skillLabel = explicitSkill ? resolveSkillLabel(explicitSkill) : ''
    let charCount = 0
    let phaseRef = AGENT_PHASE.THINKING
    // 本次生成累积的工具调用记录（[{name, arguments(dict)}]），跨工具轮追加去重
    let toolAcc = []

    const patchAssist = (patch) => {
      updateSessionById(sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistId || m.id === localAssistId ? { ...m, ...patch } : m,
        ),
      }))
    }

    // 追加工具调用，同工具同参只保留一行
    const mergeTool = (calls) => {
      for (const c of calls) {
        const key = `${c.name}::${JSON.stringify(c.arguments ?? {})}`
        const dup = toolAcc.some(
          (x) => `${x.name}::${JSON.stringify(x.arguments ?? {})}` === key,
        )
        if (!dup) {
          toolAcc.push(c)
        }
      }
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
      // 流式中剥掉模型可能附加的段落锚哨兵，避免展示 [[ANCHOR|...]]
      const cleanText = stripAnchorSentinel(chunkText)
      setAiDraft?.({
        text: cleanText,
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
        contentAnchor: reqAnchor,
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
            // 缓存后端精确上下文用量（估算入模 token vs 完整上下文窗口），供底栏圆环展示
            const cu = ev.context_usage
            if (cu && typeof cu.used_est === 'number' && cu.window) {
              updateSessionById(sessionId, (s) => ({
                ...s,
                contextUsage: { used: cu.used_est, window: cu.window },
              }))
            }
            if (draftMode) {
              syncDraft(streamBuf, 'streaming')
            } else {
              setAiDraft?.(null)
            }
            // 后端解析出的最终锚（模型哨兵优先于选区锚）随 meta 回传
            if (ev.content_anchor && typeof ev.content_anchor === 'object') {
              resolvedAnchor = ev.content_anchor
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
            const incoming = Array.isArray(ev.tools)
              ? ev.tools
                  .map((t) => {
                    const name = typeof t === 'string' ? t : t?.name
                    const rawArgs = typeof t === 'string' ? {} : t?.arguments
                    const args =
                      typeof rawArgs === 'string'
                        ? (() => {
                            try {
                              return JSON.parse(rawArgs) || {}
                            } catch {
                              return {}
                            }
                          })()
                        : rawArgs ?? {}
                    return { name, arguments: args }
                  })
                  .filter((t) => t.name)
              : []
            mergeTool(incoming)
            setPhase(AGENT_PHASE.TOOL_CALL)
            patchAssist({ tools: [...toolAcc] })
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
            // 保留已累积的工具行，不在此清空 tools
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

      const finalText = stripAnchorSentinel(result.content || streamBuf)
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
      // 兜底：若后端未随 meta 回传锚，仍可从正文末尾解析模型哨兵
      if (!resolvedAnchor) {
        const parsed = parseAnchorSentinel(result.content || streamBuf)
        if (parsed) resolvedAnchor = parsed
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
        tools: [...toolAcc],
      })
      if (draftMode) {
        setAiDraft?.({
          text: finalText,
          skill: skillLabel,
          status: 'ready',
          phase: finalPhase,
          stopped: Boolean(result.error),
          anchor: resolvedAnchor || undefined,
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
          tools: [...toolAcc],
        })
        if (draftMode && streamBuf) {
          setAiDraft?.({
            text: stripAnchorSentinel(streamBuf),
            skill: skillLabel,
            status: 'ready',
            phase: AGENT_PHASE.STOPPED,
            stopped: true,
            anchor: resolvedAnchor || undefined,
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
          tools: [...toolAcc],
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
