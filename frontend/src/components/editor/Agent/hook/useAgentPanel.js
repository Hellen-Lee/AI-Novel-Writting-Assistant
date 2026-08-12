import { useEffect, useRef, useState } from 'react'
import { MODEL_OPTIONS } from '../utils/constants'
import { parseCommand } from '../utils/parseCommand'
import { useAgentGenerate } from './useAgentGenerate'
import { useAgentSessions } from './useAgentSessions'

export function useAgentPanel({
  projectId,
  tempRules = '',
  chapterId,
  currentContent = '',
  selectedText = '',
  draft = null,
  setAiDraft,
}) {
  const [panelMode, setPanelMode] = useState('chat') // chat | history
  const [selectedSkill, setSelectedSkill] = useState('续写')
  const [input, setInput] = useState('')
  const [modelId, setModelId] = useState(MODEL_OPTIONS[0].id)
  const [modelOpen, setModelOpen] = useState(false)
  const messagesEndRef = useRef(null)
  const abortRef = useRef(null)

  const sessionsApi = useAgentSessions({
    projectId,
    onBeforeSwitch: () => abortRef.current?.(),
  })
  const {
    sessions,
    activeSessionId,
    activeSession,
    loading: sessionsLoading,
    loadError,
    updateActiveSession,
    updateSessionById,
    handleNewChat: newChat,
    handleSelectSession: selectSession,
    setLoadError,
  } = sessionsApi

  const sessionIdRef = useRef(activeSessionId)
  useEffect(() => {
    sessionIdRef.current = activeSessionId
  }, [activeSessionId])

  const generateApi = useAgentGenerate({
    projectId,
    tempRules,
    chapterId,
    currentContent,
    selectedText,
    getSessionId: () => sessionIdRef.current,
    updateSessionById,
    setAiDraft,
    onInputClear: () => setInput(''),
  })
  const {
    notice,
    setNotice,
    showNotice,
    generating,
    handleTriggerGenerate,
    handleStop,
    handleRetry,
    abortGenerate,
  } = generateApi

  useEffect(() => {
    abortRef.current = abortGenerate
  }, [abortGenerate])

  const selectedModel =
    MODEL_OPTIONS.find((m) => m.id === modelId) || MODEL_OPTIONS[0]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeSession?.messages, panelMode])

  useEffect(() => {
    if (!modelOpen) return undefined
    const onPointerDown = (e) => {
      if (!e.target.closest?.('.agent-panel__model-wrap')) {
        setModelOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [modelOpen])

  useEffect(() => {
    if (loadError) showNotice(loadError)
  }, [loadError]) // eslint-disable-line react-hooks/exhaustive-deps -- surface once per error

  const prevDraftRef = useRef(draft)
  useEffect(() => {
    const prev = prevDraftRef.current
    prevDraftRef.current = draft
    if (prev && !draft) {
      updateActiveSession((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.role === 'assistant' && m.pending
            ? { ...m, pending: false }
            : m,
        ),
      }))
    }
  }, [draft, updateActiveSession])

  const handleNewChat = async () => {
    await newChat()
    setPanelMode('chat')
    setNotice('')
    setLoadError('')
  }

  const handleSelectSession = async (id) => {
    await selectSession(id)
    setPanelMode('chat')
  }

  const handleSend = () => {
    if (generating) return
    const raw = input.trim()
    if (!raw) {
      showNotice('请输入内容，或点击快捷指令 / 输入 /技能名。')
      return
    }

    const { skillId, userText, matched } = parseCommand(raw)
    if (matched && skillId) {
      setSelectedSkill(skillId)
      handleTriggerGenerate(skillId, userText)
      return
    }
    // Free text → omit skill_name (Router / chat)
    handleTriggerGenerate(null, userText)
  }

  const handleQuickAction = (id, label) => {
    setSelectedSkill(id)
    handleTriggerGenerate(id, `请${label}`)
  }

  const clearPendingActions = () => {
    updateActiveSession((s) => ({
      ...s,
      messages: s.messages.map((m) =>
        m.role === 'assistant' && m.pending
          ? { ...m, pending: false }
          : m,
      ),
    }))
  }

  const handleDiscardDraft = () => {
    clearPendingActions()
    setAiDraft?.(null)
  }

  const handleApplyDraft = () => {
    clearPendingActions()
  }

  return {
    panelMode,
    setPanelMode,
    sessions,
    activeSessionId,
    activeSession,
    sessionsLoading,
    messagesEndRef,
    selectedSkill,
    input,
    setInput,
    notice,
    setNotice,
    showNotice,
    generating,
    modelId,
    modelOpen,
    selectedModel,
    handleNewChat,
    handleSelectSession,
    handleSend,
    handleStop,
    handleRetry,
    handleQuickAction,
    handleApplyDraft,
    handleDiscardDraft,
    setModelOpen,
    setModelId,
  }
}
