import { useEffect, useRef, useState } from 'react'
import {
  attachmentThumbUrl,
  deleteAttachment,
  uploadAttachments,
} from '../../../../api/attachments'
import { getConfig, getSavedModels } from '../../../../api/config'
import { getErrorMessage } from '../../../../api/client'
import { listSkills } from '../../../../api/skills'
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
const MAX_ATTACHMENTS = 5
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const FILE_MAX_BYTES = 10 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'])
const FILE_EXTENSIONS = new Set([
  'txt',
  'md',
  'docx',
  'pdf',
  'csv',
  'json',
])

function extensionOf(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

export function useAgentPanel({
  projectId,
  tempRules = '',
  chapterId,
  currentContent = '',
  selectedText = '',
  contentAnchor = null,
  draft = null,
  setAiDraft,
}) {
  const [panelMode, setPanelMode] = useState('chat') // chat | history
  const [selectedSkill, setSelectedSkill] = useState('续写')
  const [input, setInput] = useState('')
  const [modelOptions, setModelOptions] = useState([])
  const [modelId, setModelId] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const [attachmentItems, setAttachmentItems] = useState([])
  const [skillOptions, setSkillOptions] = useState([])
  const messagesEndRef = useRef(null)
  const abortRef = useRef(null)
  const uploadQueueRef = useRef(Promise.resolve())
  const pendingUploadCountRef = useRef(0)

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

  useEffect(() => {
    let cancelled = false
    listSkills()
      .then((data) => {
        if (!cancelled) setSkillOptions(data?.skills || [])
      })
      .catch(() => {
        if (!cancelled) setSkillOptions([])
      })
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
    contentAnchor,
    getSessionId: () => sessionIdRef.current,
    getModelId: () => modelIdRef.current || undefined,
    updateSessionById,
    setAiDraft,
    onInputClear: () => {
      setInput('')
      setAttachmentItems([])
    },
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

  const handleUploadFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    const currentAttachmentCount = attachmentItems.filter(
      (item) => item.type !== 'skill',
    ).length
    const available =
      MAX_ATTACHMENTS - currentAttachmentCount - pendingUploadCountRef.current
    if (files.length > available) {
      showNotice(`单条消息最多添加 ${MAX_ATTACHMENTS} 个文件或图片。`)
      return
    }
    const validFiles = []
    for (const file of files) {
      const ext = extensionOf(file.name)
      const type = IMAGE_EXTENSIONS.has(ext) ? 'image' : FILE_EXTENSIONS.has(ext) ? 'file' : ''
      if (!type) {
        showNotice(`暂不支持 ${ext ? `.${ext}` : '该'} 格式，可改用 docx / pdf / txt / md。`)
        continue
      }
      const limit = type === 'image' ? IMAGE_MAX_BYTES : FILE_MAX_BYTES
      if (file.size > limit) {
        showNotice(`${file.name} 超过${type === 'image' ? '5MB' : '10MB'}大小限制。`)
        continue
      }
      validFiles.push(file)
    }
    if (!validFiles.length) return
    const sessionId = sessionIdRef.current
    if (!projectId || !sessionId) {
      showNotice('会话未就绪，请稍后重试。')
      return
    }

    // 连续选择/粘贴时复用同一条队列，避免多个 multipart 请求并发写入本地附件目录。
    // pendingUploadCountRef 同时预占名额，防止队列尚未执行时绕过单轮 5 个上限。
    pendingUploadCountRef.current += validFiles.length
    uploadQueueRef.current = uploadQueueRef.current
      .catch(() => {})
      .then(async () => {
        try {
          const result = await uploadAttachments(projectId, sessionId, validFiles)
          const mapped = (result?.records || []).map((record) => ({
            ...record,
            type: record.type,
            url:
              record.type === 'image'
                ? attachmentThumbUrl(projectId, sessionId, record.id)
                : undefined,
          }))
          setAttachmentItems((prev) => [...prev, ...mapped])
          const failed = mapped.find((item) => item.status === 'failed')
          if (failed) showNotice(failed.error || `${failed.name} 上传失败。`)
        } catch (error) {
          showNotice(getErrorMessage(error, '附件上传失败'))
        } finally {
          pendingUploadCountRef.current -= validFiles.length
        }
      })
  }

  const handleRemoveAttachment = async (item) => {
    if (item.type === 'skill') {
      setAttachmentItems((prev) => prev.filter((current) => current.id !== item.id))
      return
    }
    try {
      await deleteAttachment(projectId, sessionIdRef.current, item.id)
      setAttachmentItems((prev) => prev.filter((current) => current.id !== item.id))
    } catch (error) {
      showNotice(getErrorMessage(error, '附件移除失败'))
    }
  }

  const handleAddSkill = (skill) => {
    if (!skill?.name) return
    setAttachmentItems((prev) => {
      if (prev.some((item) => item.type === 'skill' && item.skill_name === skill.name)) {
        return prev
      }
      return [
        ...prev,
        { id: `skill_${skill.name}`, type: 'skill', name: skill.name, skill_name: skill.name },
      ]
    })
  }

  const handleSend = () => {
    if (generating) return
    const raw = input.trim()
    const failedAttachment = attachmentItems.find(
      (item) => item.type !== 'skill' && item.status === 'failed',
    )
    if (failedAttachment) {
      showNotice(`请先移除失败附件：${failedAttachment.name}`)
      return
    }
    const referencedSkill = [...attachmentItems]
      .reverse()
      .find((item) => item.type === 'skill')
    if (!raw && !referencedSkill) {
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
    handleTriggerGenerate(referencedSkill?.skill_name || null, userText)
  }

  const handleQuickAction = (id, label) => {
    setSelectedSkill(id)
    handleTriggerGenerate(id, `请${label}`)
  }

  const handleClearInputAttachments = () => {
    setAttachmentItems([])
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
    attachmentItems,
    skillOptions,
    handleUploadFiles,
    handleRemoveAttachment,
    handleAddSkill,
    handleClearInputAttachments,
    handleApplyDraft,
    handleDiscardDraft,
    setModelOpen,
    setModelId,
  }
}
