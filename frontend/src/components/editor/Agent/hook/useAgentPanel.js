import { useEffect, useRef, useState } from 'react'
import { getConfig, getSavedModels } from '../../../../api/config'
import { parseCommand } from '../utils/parseCommand'
import { useAgentGenerate } from './useAgentGenerate'
import { useAgentSessions } from './useAgentSessions'

/**
 * 将后端 ModelInfo({id, owned_by}) 列表映射为下拉选项。
 * name 以 id 展示（真实模型名），desc 取 owned_by（若提供）。
 */
function toModelOptions(modelInfos) {
  return (modelInfos || [])
    .filter((m) => m && m.id)
    .map((m) => ({
      id: m.id,
      name: m.id,
      desc: (m.owned_by || '').trim() || 'API 模型',
    }))
}

const EMPTY_MODEL = { id: '', name: '选择模型', desc: '' }

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
  const [modelOptions, setModelOptions] = useState([])
  const [modelId, setModelId] = useState('')
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

  // 记录当前选中的模型 id，供生成链路随时读取（避免闭包过期）
  const modelIdRef = useRef(modelId)
  useEffect(() => {
    modelIdRef.current = modelId
  }, [modelId])

  // 挂载时拉取已保存配置 + API 可用模型，组装下拉选项并确定默认模型
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let apiOpts = []
      try {
        const listed = await getSavedModels()
        apiOpts = toModelOptions(listed?.models)
      } catch {
        apiOpts = []
      }

      // 已保存的默认模型，保证无 API 模型列表（未配置/接口失败）时也有可选项
      let savedId = ''
      try {
        const cfg = await getConfig()
        savedId = (cfg?.model || '').trim()
      } catch {
        savedId = ''
      }

      if (cancelled) return
      const merged = apiOpts.some((o) => o.id === savedId)
        ? apiOpts
        : savedId
          ? [{ id: savedId, name: savedId, desc: '已保存的默认模型' }, ...apiOpts]
          : apiOpts
      setModelOptions(merged)
      // 默认选中：优先已保存默认模型，否则取第一个可用模型
      setModelId((prev) =>
        prev && merged.some((o) => o.id === prev)
          ? prev
          : savedId || merged[0]?.id || '',
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const generateApi = useAgentGenerate({
    projectId,
    tempRules,
    chapterId,
    currentContent,
    selectedText,
    getSessionId: () => sessionIdRef.current,
    getModelId: () => modelIdRef.current || undefined,
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
    modelOptions.find((m) => m.id === modelId) ||
    modelOptions[0] ||
    EMPTY_MODEL

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
    // Free text → unified agentic path (model decides prose vs chat)
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
    modelOptions,
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
