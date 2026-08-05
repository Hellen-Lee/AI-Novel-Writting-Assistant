import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LoaderCircle, Plus, Sparkles } from 'lucide-react'
import { getErrorMessage } from '../api/client'
import {
  createChapter,
  getChapter,
  listChapters,
  updateChapter,
} from '../api/chapters'
import { EditorRightRail } from '../components/editor/EditorRightRail'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { useAgentRules } from '../components/editor/Agent/hook/useAgentRules'
import { Button } from '../components/ui/Button'
import { useEditorChrome } from '../stores/useEditorChrome'
import { countWords, formatWordCount } from '../utils/format'
import './EditorPage.css'

/** 仅章节正文（含一并提交的标题）防抖自动保存；设定库等其它页不使用 */
const AUTOSAVE_MS = 1000

function ChapterSidebar({
  chapters,
  activeChapterId,
  loadingList,
  creating,
  recentContextLabel,
  onCreateChapter,
  onSelectChapter,
}) {
  return (
    <aside className="editor-page__sidebar">
      <div className="editor-page__sidebar-head">
        <h2>章节</h2>
        <button
          type="button"
          className="editor-page__icon-btn"
          aria-label="新建章节"
          title="新建章节"
          onClick={onCreateChapter}
          disabled={creating}
        >
          <Plus size={16} />
        </button>
      </div>

      <nav className="editor-page__chapters" aria-label="章节列表">
        {loadingList ? (
          <p className="editor-page__sidebar-empty">加载中…</p>
        ) : chapters.length === 0 ? (
          <p className="editor-page__sidebar-empty">
            暂无章节。点击右上角 + 新建。
          </p>
        ) : (
          chapters.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={`editor-page__chapter${ch.id === activeChapterId ? ' is-active' : ''}`}
              onClick={() => onSelectChapter(ch.id)}
            >
              <span className="editor-page__chapter-num">第 {ch.order} 章</span>
              <span className="editor-page__chapter-title">
                {ch.title || '未命名'}
              </span>
            </button>
          ))
        )}
      </nav>

      <div className="editor-page__context-card">
        <div className="editor-page__context-title">最近 3 章上下文</div>
        <p className="editor-page__context-body">{recentContextLabel}</p>
      </div>
    </aside>
  )
}

function ChapterMain({
  error,
  onDismissError,
  notice,
  onDismissNotice,
  activeChapterId,
  activeChapter,
  loadingList,
  loadingChapter,
  creating,
  title,
  onTitleChange,
  content,
  onContentChange,
  liveWordCount,
  dirty,
  saving,
  aiDraft,
  onSave,
  onCreateChapter,
  onApplyDraft,
  onRewriteDraft,
  onDiscardDraft,
  toolbar,
}) {
  return (
    <section className="editor-page__main">
      {toolbar}
      {error ? (
        <div className="editor-page__error" role="alert">
          {error}
          <button type="button" onClick={onDismissError}>
            关闭
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="editor-page__notice" role="status">
          {notice}
          <button type="button" onClick={onDismissNotice}>
            关闭
          </button>
        </div>
      ) : null}

      {!activeChapterId && !loadingList ? (
        <div className="editor-page__empty-main">
          <p>还没有章节，先新建一章开始写作。</p>
          <Button type="button" onClick={onCreateChapter} disabled={creating}>
            新建章节
          </Button>
        </div>
      ) : (
        <>
          <header className="editor-page__main-head">
            <div className="editor-page__title-col">
              <p className="editor-page__ch-meta">
                {activeChapter ? `第 ${activeChapter.order} 章` : '—'}
              </p>
              <input
                className="editor-page__title-input"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="章节标题"
                aria-label="章节标题"
                disabled={loadingChapter}
              />
            </div>
            <div className="editor-page__chapter-actions">
              <span className="editor-page__word-count">
                本章 {formatWordCount(liveWordCount)}
              </span>
              <Button
                type="button"
                variant="secondary"
                className="editor-page__save-btn"
                onClick={onSave}
                disabled={!dirty || saving || loadingChapter || !activeChapterId}
              >
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
          </header>

          <div className="editor-page__legend" aria-hidden>
            <span className="editor-page__legend-item">
              <i className="editor-page__swatch editor-page__swatch--body" />
              已确认正文
            </span>
            <span className="editor-page__legend-item">
              <i className="editor-page__swatch editor-page__swatch--ai" />
              AI 生成 · 待插入
            </span>
          </div>

          <div className="editor-page__canvas">
            {loadingChapter ? (
              <div className="editor-page__loading">
                <LoaderCircle size={18} className="editor-page__spin" />
                加载正文…
              </div>
            ) : (
              <>
                <textarea
                  className="editor-page__textarea"
                  value={content}
                  onChange={(e) => onContentChange(e.target.value)}
                  placeholder="请输入内容…"
                  spellCheck={false}
                />

                {aiDraft ? (
                  <div className="editor-page__ai-draft">
                    <div className="editor-page__ai-draft-head">
                      <Sparkles size={14} />
                      <span>
                        AI {aiDraft.skill || '续写'}
                        {aiDraft.status === 'streaming' ? ' · 生成中' : ' · 待插入'}
                      </span>
                    </div>
                    <p className="editor-page__ai-draft-text">{aiDraft.text}</p>
                    {aiDraft.status === 'streaming' ? (
                      <div className="editor-page__stream-tail">
                        <i className="editor-page__cursor" />
                        <span>流式输出中</span>
                      </div>
                    ) : null}
                    <div className="editor-page__ai-draft-actions">
                      <button
                        type="button"
                        className="editor-page__draft-btn editor-page__draft-btn--primary"
                        disabled={aiDraft.status === 'streaming'}
                        onClick={onApplyDraft}
                      >
                        插入正文
                      </button>
                      <button
                        type="button"
                        className="editor-page__draft-btn"
                        disabled={aiDraft.status === 'streaming'}
                        onClick={onRewriteDraft}
                      >
                        改写
                      </button>
                      <button
                        type="button"
                        className="editor-page__draft-btn editor-page__draft-btn--ghost"
                        onClick={onDiscardDraft}
                      >
                        弃用
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}

/**
 * 编辑页三栏：章节列表 · 正文编辑 · 右栏（Agent / 规则）
 * 设计对照：d7ubn Editor-Toolbar、RvfPH Editor-Rules、OckRz Agent-History
 * Agent 生成链路属 §5，本阶段只搭界面与章节读写。
 */
export default function EditorPage() {
  const { projectId, chapterId: routeChapterId } = useParams()
  const navigate = useNavigate()
  const { setSaveStatus } = useEditorChrome()
  const rulesId = useId()

  const [chapters, setChapters] = useState([])
  const [activeChapterId, setActiveChapterId] = useState(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState({ title: '', content: '' })
  const [loadingList, setLoadingList] = useState(true)
  const [loadingChapter, setLoadingChapter] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [aiDraft, setAiDraft] = useState(null)
  const [rightPanel, setRightPanel] = useState({ open: true, mode: 'agent' })

  const rulesActive = rightPanel.open && rightPanel.mode === 'rules'
  const {
    tempRules,
    rulesDraft,
    setRulesDraft,
    globalRules,
    stylePreference,
    openRules,
    handleRulesClear,
    handleRulesSave,
  } = useAgentRules({ projectId, active: rulesActive })

  const dirty = useMemo(
    () =>
      title !== savedSnapshot.title || content !== savedSnapshot.content,
    [title, content, savedSnapshot],
  )
  const contentDirty = content !== savedSnapshot.content

  const liveWordCount = useMemo(() => countWords(content), [content])
  const saveTimerRef = useRef(null)
  const handleSaveRef = useRef(null)
  const titleRef = useRef(title)
  const contentRef = useRef(content)
  const snapshotRef = useRef(savedSnapshot)

  useEffect(() => {
    titleRef.current = title
  }, [title])
  useEffect(() => {
    contentRef.current = content
  }, [content])
  useEffect(() => {
    snapshotRef.current = savedSnapshot
  }, [savedSnapshot])

  const recentContextLabel = useMemo(() => {
    if (!chapters.length || !activeChapterId) return '暂无章节上下文'
    const idx = chapters.findIndex((c) => c.id === activeChapterId)
    if (idx < 0) return '暂无章节上下文'
    const start = Math.max(0, idx - 2)
    const slice = chapters.slice(start, idx + 1)
    if (!slice.length) return '暂无章节上下文'
    const first = slice[0].order
    const last = slice[slice.length - 1].order
    if (first === last) {
      return `自动注入续写请求 · 第 ${first} 章已载入`
    }
    return `自动注入续写请求 · 第 ${first}–${last} 章已载入`
  }, [chapters, activeChapterId])

  const activeChapter = chapters.find((c) => c.id === activeChapterId)

  useEffect(() => {
    if (saving) setSaveStatus('saving')
    else if (dirty) setSaveStatus('dirty')
    else setSaveStatus('saved')
  }, [dirty, saving, setSaveStatus])

  const loadChapters = useCallback(async () => {
    setLoadingList(true)
    setError('')
    try {
      const list = await listChapters(projectId)
      setChapters(list)
      return list
    } catch (err) {
      setError(getErrorMessage(err, '加载章节失败'))
      setChapters([])
      return []
    } finally {
      setLoadingList(false)
    }
  }, [projectId])

  const loadChapter = useCallback(
    async (id) => {
      if (!id) return
      setLoadingChapter(true)
      setError('')
      setAiDraft(null)
      try {
        const detail = await getChapter(projectId, id)
        setActiveChapterId(detail.id)
        setTitle(detail.title || '')
        setContent(detail.content || '')
        setSavedSnapshot({
          title: detail.title || '',
          content: detail.content || '',
        })
      } catch (err) {
        setError(getErrorMessage(err, '加载章节正文失败'))
      } finally {
        setLoadingChapter(false)
      }
    },
    [projectId],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await loadChapters()
      if (cancelled) return
      if (!list.length) {
        setActiveChapterId(null)
        setTitle('')
        setContent('')
        setSavedSnapshot({ title: '', content: '' })
        return
      }
      const preferred =
        (routeChapterId && list.find((c) => c.id === routeChapterId)?.id) ||
        list[0].id
      await loadChapter(preferred)
      if (
        !cancelled &&
        preferred &&
        routeChapterId !== preferred
      ) {
        navigate(`/projects/${projectId}/edit/${preferred}`, { replace: true })
      }
    })()
    return () => {
      cancelled = true
    }
    // 仅在 project / 路由章 id 变化时重载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, routeChapterId])

  const handleSave = useCallback(async () => {
    if (!activeChapterId || saving) return false
    const cleanedTitle = title.trim()
    if (!cleanedTitle) {
      setError('章节标题不能为空')
      return false
    }
    setSaving(true)
    setError('')
    try {
      const detail = await updateChapter(projectId, activeChapterId, {
        title: cleanedTitle,
        content,
      })
      setTitle(detail.title)
      setContent(detail.content)
      setSavedSnapshot({ title: detail.title, content: detail.content })
      setChapters((prev) =>
        prev.map((c) =>
          c.id === detail.id
            ? {
                ...c,
                title: detail.title,
                word_count: detail.word_count ?? countWords(detail.content),
              }
            : c,
        ),
      )
      return true
    } catch (err) {
      setError(getErrorMessage(err, '保存失败'))
      return false
    } finally {
      setSaving(false)
    }
  }, [activeChapterId, saving, title, content, projectId])

  useEffect(() => {
    handleSaveRef.current = handleSave
  }, [handleSave])

  const flushAutosave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (!contentDirty) return true
    return (await handleSaveRef.current?.()) ?? true
  }, [contentDirty])

  useEffect(() => {
    if (!contentDirty || !activeChapterId || loadingChapter || saving) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      handleSaveRef.current?.()
    }, AUTOSAVE_MS)
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [contentDirty, content, activeChapterId, loadingChapter, saving])

  const confirmLeaveIfDirty = async () => {
    const saved = await flushAutosave()
    if (!saved) return false
    const snap = snapshotRef.current
    const stillDirty =
      titleRef.current !== snap.title || contentRef.current !== snap.content
    if (!stillDirty) return true
    return window.confirm('当前章节有未保存修改，确定离开吗？')
  }

  const handleSelectChapter = async (id) => {
    if (id === activeChapterId) return
    if (!(await confirmLeaveIfDirty())) return
    navigate(`/projects/${projectId}/edit/${id}`)
  }

  const handleCreateChapter = async () => {
    if (creating) return
    if (!(await confirmLeaveIfDirty())) return
    setCreating(true)
    setError('')
    try {
      const nextOrder =
        chapters.reduce((max, c) => Math.max(max, c.order || 0), 0) + 1
      const detail = await createChapter(projectId, {
        title: `第 ${nextOrder} 章`,
        content: '',
      })
      await loadChapters()
      navigate(`/projects/${projectId}/edit/${detail.id}`)
    } catch (err) {
      setError(getErrorMessage(err, '新建章节失败'))
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  const handleApplyDraft = () => {
    if (!aiDraft?.text) return
    setContent((prev) => {
      const base = prev.replace(/\s+$/, '')
      return base ? `${base}\n\n${aiDraft.text}` : aiDraft.text
    })
    setAiDraft(null)
  }

  const handleDiscardDraft = () => {
    setAiDraft(null)
  }

  const handleSelectAgent = () => {
    setRightPanel({ open: true, mode: 'agent' })
  }

  const handleSelectRules = () => {
    openRules()
    setRightPanel({ open: true, mode: 'rules' })
  }

  const handleExport = () => {
    setNotice('导出功能待后续版本接入。')
  }

  const handleCollapseRail = () => {
    setRightPanel((prev) => ({ ...prev, open: false }))
  }

  const handleRulesClose = () => {
    setRightPanel({ open: true, mode: 'agent' })
  }

  const handleRulesSaveAndClose = () => {
    handleRulesSave()
    setRightPanel({ open: true, mode: 'agent' })
  }

  return (
    <div className="editor-page">
      <ChapterSidebar
        chapters={chapters}
        activeChapterId={activeChapterId}
        loadingList={loadingList}
        creating={creating}
        recentContextLabel={recentContextLabel}
        onCreateChapter={handleCreateChapter}
        onSelectChapter={handleSelectChapter}
      />
      <ChapterMain
        error={error}
        onDismissError={() => setError('')}
        notice={notice}
        onDismissNotice={() => setNotice('')}
        activeChapterId={activeChapterId}
        activeChapter={activeChapter}
        loadingList={loadingList}
        loadingChapter={loadingChapter}
        creating={creating}
        title={title}
        onTitleChange={setTitle}
        content={content}
        onContentChange={setContent}
        liveWordCount={liveWordCount}
        dirty={dirty}
        saving={saving}
        aiDraft={aiDraft}
        onSave={handleSave}
        onCreateChapter={handleCreateChapter}
        onApplyDraft={handleApplyDraft}
        onRewriteDraft={() =>
          setAiDraft((d) => (d ? { ...d, status: 'ready' } : d))
        }
        onDiscardDraft={handleDiscardDraft}
        toolbar={
          <EditorToolbar
            activeMode={rightPanel.mode}
            panelOpen={rightPanel.open}
            hasTempRules={Boolean(tempRules.trim())}
            onSelectAgent={handleSelectAgent}
            onSelectRules={handleSelectRules}
            onExport={handleExport}
          />
        }
      />
      <EditorRightRail
        open={rightPanel.open}
        mode={rightPanel.mode}
        projectId={projectId}
        tempRules={tempRules}
        draft={aiDraft}
        onApplyDraft={handleApplyDraft}
        onDiscardDraft={handleDiscardDraft}
        onCollapse={handleCollapseRail}
        rulesId={rulesId}
        globalRules={globalRules}
        stylePreference={stylePreference}
        rulesDraft={rulesDraft}
        onRulesDraftChange={setRulesDraft}
        onRulesClear={handleRulesClear}
        onRulesSave={handleRulesSaveAndClose}
        onRulesClose={handleRulesClose}
      />
    </div>
  )
}
