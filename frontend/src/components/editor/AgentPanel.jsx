import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowUp,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  Expand,
  FilePen,
  History,
  MessageSquarePlus,
  PenLine,
  Plus,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { getProject } from '../../api/projects'
import './AgentPanel.css'

function displayReadonly(text, empty = '（未配置）') {
  const value = (text || '').trim()
  return value || empty
}

const AI_PLACEHOLDER = 'AI 生成将在生成链路联调后接入；当前可编辑临时规则与会话界面。'

const QUICK_ACTIONS = [
  { id: 'continue', label: '续写', icon: PenLine },
  { id: 'polish', label: '润色', icon: Sparkles },
  { id: 'expand', label: '扩写', icon: Expand },
  { id: 'generate_setting', label: '生成设定', icon: BookOpen },
]

/** 界面占位模型列表（配置页接入前本地展示） */
const MODEL_OPTIONS = [
  { id: 'deepseek', name: 'DeepSeek', desc: '默认' },
  { id: 'doubao', name: '豆包', desc: 'Pro' },
  { id: 'gpt-4o', name: 'GPT-4o', desc: 'OpenAI' },
  { id: 'claude', name: 'Claude', desc: 'Sonnet' },
  { id: 'qwen', name: '通义千问', desc: 'Plus' },
]

function createSession(title = '新对话') {
  return {
    id: `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    messages: [],
    updatedAt: Date.now(),
  }
}

/**
 * 右侧 AI Agent 栏（仅界面；生成走后续链路）
 * 设计对照：NMi2X Sidebar/Agent、C88ki / Ts9tL Overlay/TempRules
 */
export function AgentPanel({
  projectId,
  onApplyDraft,
  onDiscardDraft,
  draft = null,
}) {
  const [sessions, setSessions] = useState(() => [createSession('当前会话')])
  const [activeSessionId, setActiveSessionId] = useState(() => sessions[0].id)
  const [panelMode, setPanelMode] = useState('chat') // chat | history | rules
  const [tempRules, setTempRules] = useState('')
  const [rulesDraft, setRulesDraft] = useState('')
  const [globalRules, setGlobalRules] = useState('')
  const [stylePreference, setStylePreference] = useState('')
  const [selectedSkill, setSelectedSkill] = useState('continue')
  const [input, setInput] = useState('')
  const [notice, setNotice] = useState('')
  const [generating, setGenerating] = useState(false)
  const [modelId, setModelId] = useState(MODEL_OPTIONS[0].id)
  const [modelOpen, setModelOpen] = useState(false)
  const messagesEndRef = useRef(null)
  const rulesId = useId()
  const selectedModel =
    MODEL_OPTIONS.find((m) => m.id === modelId) || MODEL_OPTIONS[0]

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0]

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
    if (panelMode !== 'rules' || !projectId) return undefined
    let cancelled = false
    getProject(projectId)
      .then((detail) => {
        if (cancelled) return
        setGlobalRules(detail?.settings?.global_rules || '')
        setStylePreference(detail?.settings?.style_preference || '')
      })
      .catch(() => {
        if (cancelled) return
        setGlobalRules('')
        setStylePreference('')
      })
    return () => {
      cancelled = true
    }
  }, [panelMode, projectId])

  const showNotice = (text) => {
    setNotice(text)
  }

  const updateActiveSession = (updater) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s
        const next = updater(s)
        return { ...next, updatedAt: Date.now() }
      }),
    )
  }

  const handleNewChat = () => {
    const session = createSession(`对话 ${sessions.length + 1}`)
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(session.id)
    setPanelMode('chat')
    setNotice('')
  }

  const handleSelectSession = (id) => {
    setActiveSessionId(id)
    setPanelMode('chat')
  }

  const handleTriggerGenerate = (skillId, userText) => {
    const skill = QUICK_ACTIONS.find((q) => q.id === skillId) || QUICK_ACTIONS[0]
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
    setInput('')
    setGenerating(true)
    showNotice(AI_PLACEHOLDER)
    window.setTimeout(() => setGenerating(false), 600)
  }

  const handleSend = () => {
    if (generating) return
    const raw = input.trim()
    if (!raw) {
      showNotice('请输入指令，或点击快捷指令。')
      return
    }

    let skillId = selectedSkill
    let userText = raw
    const slash = raw.match(/^\/([a-z0-9_-]+)\s*(.*)$/i)
    if (slash) {
      const name = slash[1].toLowerCase()
      const mapped = QUICK_ACTIONS.find(
        (q) => q.id === name || q.id.replace('_', '-') === name,
      )
      if (mapped) {
        skillId = mapped.id
        setSelectedSkill(mapped.id)
        userText = slash[2].trim() || `/${mapped.id}`
      }
    }

    handleTriggerGenerate(skillId, userText)
  }

  const handleStop = () => {
    setGenerating(false)
    showNotice('已终止（界面预览；真实中断将在生成链路接入）。')
  }

  const handleRetry = () => {
    showNotice(AI_PLACEHOLDER)
  }

  const openRules = () => {
    setRulesDraft(tempRules)
    setPanelMode('rules')
  }

  const handleRulesBack = () => {
    setPanelMode('chat')
  }

  const handleRulesClear = () => {
    setRulesDraft('')
  }

  const handleRulesSave = () => {
    setTempRules(rulesDraft)
    setPanelMode('chat')
  }

  return (
    <aside className="agent-panel">
      <header className="agent-panel__head">
        <div className="agent-panel__head-left">
          <Bot size={16} strokeWidth={2} aria-hidden />
          <h2>AI 对话</h2>
          {tempRules.trim() ? (
            <span className="agent-panel__rules-badge" title="已设置临时规则">
              规则
            </span>
          ) : null}
        </div>
        <div className="agent-panel__head-actions">
          <button
            type="button"
            className={`agent-panel__icon-btn${panelMode === 'history' ? ' is-active' : ''}`}
            aria-label="历史会话"
            title="历史会话"
            onClick={() =>
              setPanelMode((m) => (m === 'history' ? 'chat' : 'history'))
            }
          >
            <History size={15} />
          </button>
          <button
            type="button"
            className="agent-panel__icon-btn"
            aria-label="新建对话"
            title="新建对话"
            onClick={handleNewChat}
          >
            <MessageSquarePlus size={15} />
          </button>
          <button
            type="button"
            className={`agent-panel__icon-btn${panelMode === 'rules' ? ' is-active' : ''}`}
            aria-label="临时规则"
            title="临时规则"
            onClick={() => {
              if (panelMode === 'rules') {
                handleRulesBack()
              } else {
                openRules()
              }
            }}
          >
            <FilePen size={15} />
          </button>
        </div>
      </header>

      {panelMode === 'history' ? (
        <div className="agent-panel__overlay">
          <div className="agent-panel__overlay-head">
            <h3>历史会话</h3>
            <button
              type="button"
              className="agent-panel__icon-btn"
              aria-label="关闭"
              onClick={() => setPanelMode('chat')}
            >
              <X size={15} />
            </button>
          </div>
          <ul className="agent-panel__session-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`agent-panel__session${s.id === activeSessionId ? ' is-active' : ''}`}
                  onClick={() => handleSelectSession(s.id)}
                >
                  <span className="agent-panel__session-title">{s.title}</span>
                  <span className="agent-panel__session-meta">
                    {s.messages.length} 条消息
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="agent-panel__hint">会话仅保存在本页内存，刷新后清空。</p>
        </div>
      ) : null}

      {panelMode === 'rules' ? (
        <div className="agent-panel__overlay agent-panel__overlay--rules">
          <div className="agent-panel__rules-head">
            <button
              type="button"
              className="agent-panel__rules-back"
              onClick={handleRulesBack}
            >
              <ChevronLeft size={16} strokeWidth={2} aria-hidden />
              AI 对话
            </button>
          </div>

          <div className="agent-panel__rules-body">
            <section className="agent-panel__rules-section">
              <h3 className="agent-panel__rules-sec-title">全局规则</h3>
              <div className="agent-panel__rules-readonly">
                {displayReadonly(globalRules)}
              </div>
            </section>

            <section className="agent-panel__rules-section">
              <h3 className="agent-panel__rules-sec-title">文风偏好</h3>
              <div className="agent-panel__rules-readonly">
                {displayReadonly(stylePreference)}
              </div>
            </section>

            <section className="agent-panel__rules-section agent-panel__rules-section--temp">
              <label
                className="agent-panel__rules-sec-title agent-panel__rules-sec-title--emph"
                htmlFor={rulesId}
              >
                临时规则
              </label>
              <textarea
                id={rulesId}
                className="agent-panel__rules-input"
                value={rulesDraft}
                onChange={(e) => setRulesDraft(e.target.value)}
                placeholder="例如：本章侧重压迫感；暂不揭示身份；对话短促……"
              />
            </section>
          </div>

          <div className="agent-panel__rules-footer">
            <button
              type="button"
              className="agent-panel__rules-btn agent-panel__rules-btn--clear"
              onClick={handleRulesClear}
            >
              清空临时规则
            </button>
            <button
              type="button"
              className="agent-panel__rules-btn agent-panel__rules-btn--save"
              onClick={handleRulesSave}
            >
              保存
            </button>
          </div>
        </div>
      ) : null}

      {panelMode === 'chat' ? (
        <>
          <div className="agent-panel__messages">
            {activeSession.messages.length === 0 ? (
              <p className="agent-panel__empty">
                使用底栏快捷指令，或输入 <code>/continue</code> 等 skill
                名。生成链路接入前，结果区仅作界面预览。
              </p>
            ) : (
              activeSession.messages.map((msg) =>
                msg.role === 'user' ? (
                  <div key={msg.id} className="agent-panel__msg agent-panel__msg--user">
                    <div className="agent-panel__bubble agent-panel__bubble--user">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="agent-panel__msg agent-panel__msg--ai">
                    <div className="agent-panel__ai-meta">
                      <span className="agent-panel__ai-name">Agent</span>
                      {msg.skill ? (
                        <span className="agent-panel__ai-skill">· {msg.skill}</span>
                      ) : null}
                    </div>
                    <div className="agent-panel__bubble agent-panel__bubble--ai">
                      <p>{msg.content}</p>
                      {msg.pending ? (
                        <div className="agent-panel__msg-actions">
                          <button
                            type="button"
                            className="agent-panel__mini-btn agent-panel__mini-btn--primary"
                            disabled={!draft}
                            onClick={() => onApplyDraft?.()}
                          >
                            插入文末
                          </button>
                          <button
                            type="button"
                            className="agent-panel__mini-btn"
                            onClick={handleRetry}
                          >
                            重写
                          </button>
                          <button
                            type="button"
                            className="agent-panel__mini-btn agent-panel__mini-btn--ghost"
                            onClick={() => onDiscardDraft?.()}
                          >
                            弃用
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ),
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          <footer className="agent-panel__foot">
            {notice ? (
              <div className="agent-panel__notice" role="status">
                {notice}
                <button
                  type="button"
                  className="agent-panel__notice-close"
                  aria-label="关闭提示"
                  onClick={() => setNotice('')}
                >
                  <X size={12} />
                </button>
              </div>
            ) : null}

            <div className="agent-panel__qa" role="group" aria-label="快捷指令">
              {QUICK_ACTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`agent-panel__qa-btn${selectedSkill === id ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedSkill(id)
                    handleTriggerGenerate(id, `请${label}`)
                  }}
                  disabled={generating}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            <div className="agent-panel__composer">
              <textarea
                className="agent-panel__input"
                rows={2}
                value={input}
                disabled={generating}
                placeholder={
                  generating
                    ? '正在生成回复，可点击终止…'
                    : '输入 / 调用技能，或直接对话…'
                }
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <div className="agent-panel__toolrow">
                <button
                  type="button"
                  className="agent-panel__tool-btn"
                  aria-label="附加"
                  title="附加（占位）"
                  onClick={() => showNotice('附加能力待后续版本接入。')}
                >
                  <Plus size={16} />
                </button>

                <div className="agent-panel__model-wrap">
                  <button
                    type="button"
                    className={`agent-panel__model-btn${modelOpen ? ' is-open' : ''}`}
                    aria-haspopup="listbox"
                    aria-expanded={modelOpen}
                    onClick={() => setModelOpen((o) => !o)}
                  >
                    <span>{selectedModel.name}</span>
                    <ChevronDown size={12} />
                  </button>
                  {modelOpen ? (
                    <ul
                      className="agent-panel__model-menu"
                      role="listbox"
                      aria-label="选择模型"
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={m.id === modelId}
                            className={`agent-panel__model-item${m.id === modelId ? ' is-active' : ''}`}
                            onClick={() => {
                              setModelId(m.id)
                              setModelOpen(false)
                            }}
                          >
                            <span className="agent-panel__model-item-left">
                              <span className="agent-panel__model-item-name">
                                {m.name}
                              </span>
                              <span className="agent-panel__model-item-desc">
                                {m.desc}
                              </span>
                            </span>
                            {m.id === modelId ? <Check size={14} /> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="agent-panel__toolrow-spacer" />

                {generating ? (
                  <button
                    type="button"
                    className="agent-panel__send agent-panel__send--stop"
                    aria-label="终止生成"
                    onClick={handleStop}
                  >
                    <Square size={10} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="agent-panel__send"
                    aria-label="发送"
                    onClick={handleSend}
                  >
                    <ArrowUp size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </footer>
        </>
      ) : null}
    </aside>
  )
}
