import { useEffect, useRef, useState } from 'react'
import { MODEL_OPTIONS } from '../utils/constants'
import { parseCommand } from '../utils/parseCommand'
import { useAgentGenerate } from './useAgentGenerate'
import { useAgentSessions } from './useAgentSessions'

export function useAgentPanel({ projectId, tempRules = '' }) {
  const [panelMode, setPanelMode] = useState('chat') // chat | history
  const [selectedSkill, setSelectedSkill] = useState('continue')
  const [input, setInput] = useState('')
  const [modelId, setModelId] = useState(MODEL_OPTIONS[0].id)
  const [modelOpen, setModelOpen] = useState(false)
  const messagesEndRef = useRef(null)

  const sessionsApi = useAgentSessions()
  const {
    sessions,
    activeSessionId,
    activeSession,
    updateActiveSession,
    handleNewChat: newChat,
    handleSelectSession: selectSession,
  } = sessionsApi

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
    setModelOpen,
    setModelId,
  }
}
