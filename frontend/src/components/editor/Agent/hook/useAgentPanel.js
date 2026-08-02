import { useEffect, useId, useRef, useState } from 'react'
import { MODEL_OPTIONS } from '../utils/constants'
import { parseCommand } from '../utils/parseCommand'
import { useAgentGenerate } from './useAgentGenerate'
import { useAgentRules } from './useAgentRules'
import { useAgentSessions } from './useAgentSessions'

export function useAgentPanel({ projectId }) {
  const [panelMode, setPanelMode] = useState('chat') // chat | history | rules
  const [selectedSkill, setSelectedSkill] = useState('continue')
  const [input, setInput] = useState('')
  const [modelId, setModelId] = useState(MODEL_OPTIONS[0].id)
  const [modelOpen, setModelOpen] = useState(false)
  const messagesEndRef = useRef(null)
  const rulesId = useId()

  const sessionsApi = useAgentSessions()
  const {
    sessions,
    activeSessionId,
    activeSession,
    updateActiveSession,
    handleNewChat: newChat,
    handleSelectSession: selectSession,
  } = sessionsApi

  const rulesApi = useAgentRules({ projectId, panelMode })
  const {
    tempRules,
    rulesDraft,
    setRulesDraft,
    globalRules,
    stylePreference,
    openRules: prepareRules,
    handleRulesClear,
    handleRulesSave: saveRules,
  } = rulesApi

  const generateApi = useAgentGenerate({
    projectId,
    tempRules,
    updateActiveSession,
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
  } = generateApi

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

  const handleNewChat = () => {
    newChat()
    setPanelMode('chat')
    setNotice('')
  }

  const handleSelectSession = (id) => {
    selectSession(id)
    setPanelMode('chat')
  }

  const handleSend = () => {
    if (generating) return
    const raw = input.trim()
    if (!raw) {
      showNotice('请输入指令，或点击快捷指令。')
      return
    }

    const { skillId, userText, matched } = parseCommand(raw, selectedSkill)
    if (matched) {
      setSelectedSkill(skillId)
    }
    handleTriggerGenerate(skillId, userText)
  }

  const openRules = () => {
    prepareRules()
    setPanelMode('rules')
  }

  const handleRulesBack = () => {
    setPanelMode('chat')
  }

  const handleRulesSave = () => {
    saveRules()
    setPanelMode('chat')
  }

  const handleQuickAction = (id, label) => {
    setSelectedSkill(id)
    handleTriggerGenerate(id, `请${label}`)
  }

  return {
    panelMode,
    setPanelMode,
    sessions,
    activeSessionId,
    activeSession,
    messagesEndRef,
    rulesId,
    tempRules,
    rulesDraft,
    setRulesDraft,
    globalRules,
    stylePreference,
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
    openRules,
    handleRulesBack,
    handleRulesClear,
    handleRulesSave,
    setModelOpen,
    setModelId,
  }
}
