import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleCheck, Circle, Sparkles } from 'lucide-react'
import { getErrorMessage } from '../api/client'
import { putMemory } from '../api/memory'
import { generateOnboardingSettings } from '../api/onboarding'
import { createProject, updateProject } from '../api/projects'
import { CharacterEditModal } from '../components/onboarding/CharacterEditModal'
import {
  CharactersSection,
  GENRE_PRESETS,
  GenreWorldviewSection,
  OutlineSection,
  StoryCoreSection,
} from '../components/onboarding/OnboardingSections'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import {
  countChars,
  createLocalId,
  emptyCharacterDraft,
  emptyVolumeDraft,
  formatStoryCoreDescription,
  volumeLabelFromIndex,
} from '../utils/onboarding'
import './OnboardingPage.css'

function StatusItem({ done, label }) {
  return (
    <span
      className={`onboarding-page__status-item ${done ? 'onboarding-page__status-item--done' : 'onboarding-page__status-item--todo'}`}
    >
      {done ? <CircleCheck size={12} /> : <Circle size={12} />}
      {label}
    </span>
  )
}

export default function OnboardingPage() {
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [customGenreOpen, setCustomGenreOpen] = useState(false)
  const [customGenre, setCustomGenre] = useState('')
  const [worldview, setWorldview] = useState('')
  const [core, setCore] = useState({ theme: '', conflict: '', plotline: '' })
  const [characters, setCharacters] = useState([])
  const [synopsis, setSynopsis] = useState('')
  const [volumes, setVolumes] = useState([])

  const [modal, setModal] = useState(null)
  const [draft, setDraft] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [aiGenerating, setAiGenerating] = useState('') // '' | 'all' | section key
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const status = useMemo(
    () => ({
      genre: Boolean(genre.trim() || title.trim()),
      core: Boolean(core.theme.trim() || core.conflict.trim() || core.plotline.trim()),
      characters: characters.length > 0,
      outline: Boolean(synopsis.trim() || volumes.length > 0),
    }),
    [genre, title, core, characters, synopsis, volumes],
  )

  const currentContext = useMemo(
    () => ({
      topic: title,
      genre,
      worldview,
      story_core: core,
      characters,
      synopsis,
      volumes,
    }),
    [title, genre, worldview, core, characters, synopsis, volumes],
  )

  const runAiGenerate = async (section) => {
    if (aiGenerating) return
    // 全量或单区生成前，需要至少一句核心想法/题材作为灵感前提
    const hasInspiration = Boolean((title || '').trim() || (genre || '').trim())
    if (!hasInspiration) {
      setError('')
      setNotice('请先填写「作品暂定名」或一句核心想法/题材，作为 AI 生成的灵感来源。')
      return
    }
    setAiGenerating(section || 'all')
    setError('')
    setNotice('')
    try {
      const result = await generateOnboardingSettings({
        ...currentContext,
        section: section || null,
      })
      applyAiResult(result, section || null)
    } catch (err) {
      setError(getErrorMessage(err, 'AI 生成失败'))
    } finally {
      setAiGenerating('')
    }
  }

  const applyAiResult = (result, section) => {
    if (!section) {
      // 全量：回填四区块（保留用户已填的题材/类型，AI 仅补充设定）
      if (result.genre && !genre) setGenre(result.genre)
      if (result.worldview) setWorldview(result.worldview)
      if (result.story_core && Object.values(result.story_core).some(Boolean)) {
        setCore((c) => ({
          theme: result.story_core.theme || c.theme,
          conflict: result.story_core.conflict || c.conflict,
          plotline: result.story_core.plotline || c.plotline,
        }))
      }
      if (result.characters?.length) {
        setCharacters(
          result.characters.map((c, i) => ({
            id: createLocalId('char'),
            name: c.name,
            role: c.role || '',
            profile: c.profile || '',
            relationship: c.relationship || [],
          })),
        )
      }
      if (result.synopsis) setSynopsis(result.synopsis)
      if (result.volumes?.length) {
        setVolumes(
          result.volumes.map((v, i) => ({
            id: createLocalId('vol'),
            label: volumeLabelFromIndex(i),
            name: v.name,
            summary: v.summary || '',
          })),
        )
      }
      setNotice('已生成全部设定，请检查后再确认创建。')
      return
    }

    // 单区重生成：仅覆盖目标区块
    if (section === 'worldview' && result.worldview) {
      setWorldview(result.worldview)
    } else if (section === 'story_core' && result.story_core) {
      setCore((c) => ({
        theme: result.story_core.theme || c.theme,
        conflict: result.story_core.conflict || c.conflict,
        plotline: result.story_core.plotline || c.plotline,
      }))
    } else if (section === 'characters' && result.characters?.length) {
      setCharacters(
        result.characters.map((c, i) => ({
          id: createLocalId('char'),
          name: c.name,
          role: c.role || '',
          profile: c.profile || '',
          relationship: c.relationship || [],
        })),
      )
    } else if (section === 'outline') {
      if (result.synopsis) setSynopsis(result.synopsis)
      if (result.volumes?.length) {
        setVolumes(
          result.volumes.map((v, i) => ({
            id: createLocalId('vol'),
            label: volumeLabelFromIndex(i),
            name: v.name,
            summary: v.summary || '',
          })),
        )
      }
    }
    const labels = {
      worldview: '世界观',
      story_core: '故事内核',
      characters: '主要角色',
      outline: '全本大纲',
    }
    setNotice(`已生成${labels[section] || '该区块'}设定，请检查后再确认创建。`)
  }

  const selectGenre = (value) => {
    setCustomGenreOpen(false)
    setGenre(value)
  }

  const confirmCustomGenre = () => {
    const value = customGenre.trim()
    if (!value) return
    setGenre(value)
    setCustomGenreOpen(false)
  }

  const openWorldviewModal = () => {
    setDraft({ text: worldview })
    setModal({ type: 'worldview' })
  }

  const openBriefModal = () => {
    setDraft({ text: synopsis })
    setModal({ type: 'brief' })
  }

  const openCharacterModal = (character = null) => {
    if (character) {
      setDraft({
        ...character,
        relationship:
          character.relationship?.length > 0
            ? character.relationship.map((r) => ({ ...r }))
            : [{ type: '', target: '' }],
      })
      setModal({ type: 'character', mode: 'edit', id: character.id })
    } else {
      setDraft(emptyCharacterDraft())
      setModal({ type: 'character', mode: 'add' })
    }
  }

  const openVolumeModal = (volume = null, index = volumes.length) => {
    if (volume) {
      setDraft({ ...volume })
      setModal({ type: 'volume', mode: 'edit', id: volume.id })
    } else {
      setDraft(emptyVolumeDraft(index))
      setModal({ type: 'volume', mode: 'add' })
    }
  }

  const closeModal = () => {
    setModal(null)
    setDraft(null)
  }

  const saveWorldviewModal = () => {
    setWorldview(draft?.text || '')
    closeModal()
  }

  const saveBriefModal = () => {
    setSynopsis(draft?.text || '')
    closeModal()
  }

  const saveCharacterModal = () => {
    const name = (draft?.name || '').trim()
    if (!name) {
      setError('请填写角色名')
      return
    }
    setError('')
    const relationship = (draft.relationship || [])
      .map((r) => ({ type: (r.type || '').trim(), target: (r.target || '').trim() }))
      .filter((r) => r.type && r.target)

    const entry = {
      id: modal.mode === 'edit' ? modal.id : createLocalId('char'),
      name,
      role: (draft.role || '').trim(),
      profile: (draft.profile || '').trim(),
      relationship,
    }

    setCharacters((prev) => {
      if (modal.mode === 'edit') {
        return prev.map((c) => (c.id === entry.id ? entry : c))
      }
      return [...prev, entry]
    })
    closeModal()
  }

  const saveVolumeModal = () => {
    const name = (draft?.name || '').trim()
    if (!name) {
      setError('请填写卷名')
      return
    }
    setError('')
    const entry = {
      id: modal.mode === 'edit' ? modal.id : createLocalId('vol'),
      label: (draft.label || '').trim() || volumeLabelFromIndex(volumes.length),
      name,
      summary: (draft.summary || '').trim(),
    }

    setVolumes((prev) => {
      if (modal.mode === 'edit') {
        return prev.map((v) => (v.id === entry.id ? entry : v))
      }
      return [...prev, entry]
    })
    closeModal()
  }

  const removeCharacter = (id) => {
    setCharacters((prev) => prev.filter((c) => c.id !== id))
  }

  const removeVolume = (id) => {
    setVolumes((prev) =>
      prev
        .filter((v) => v.id !== id)
        .map((v, i) => ({ ...v, label: v.label || volumeLabelFromIndex(i) })),
    )
  }

  const persistProject = async ({ skipRich = false } = {}) => {
    const name = title.trim() || '未命名作品'
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const created = await createProject({
        name,
        genre: genre.trim(),
        description: skipRich ? '' : formatStoryCoreDescription(core),
        synopsis: skipRich ? '' : synopsis.trim(),
        first_chapter_title: '第一章',
      })
      const projectId = created?.meta?.id
      if (!projectId) throw new Error('创建成功但未返回项目 ID')

      if (!skipRich) {
        const storyCoreEntries = [
          { key: 'theme', name: '核心主题', value: core.theme },
          { key: 'conflict', name: '核心冲突', value: core.conflict },
          { key: 'plotline', name: '故事主线', value: core.plotline },
        ]
          .filter((item) => (item.value || '').trim())
          .map((item) => ({
            id: createLocalId(item.key),
            name: item.name,
            content: item.value.trim(),
            tags: [],
          }))

        const memoryPayload = {
          worldview: worldview.trim()
            ? [
                {
                  id: createLocalId('wv'),
                  name: '世界观',
                  content: worldview.trim(),
                  tags: [],
                },
              ]
            : [],
          characters: characters.map((c) => ({
            id: c.id,
            name: c.name,
            profile: c.profile,
            relationship: c.relationship || [],
            tags: c.role ? [c.role] : [],
          })),
          story_core: storyCoreEntries,
        }
        await putMemory(projectId, memoryPayload)

        if (volumes.length > 0 || synopsis.trim()) {
          await updateProject(projectId, {
            synopsis: synopsis.trim(),
            volumes: volumes.map((v, i) => ({
              id: v.id,
              label: v.label || volumeLabelFromIndex(i),
              name: v.name,
              summary: v.summary || '',
            })),
          })
        }
      }

      navigate(`/projects/${projectId}/edit`)
    } catch (err) {
      setError(getErrorMessage(err, '创建项目失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirm = () => {
    if (!title.trim() && !genre.trim() && !worldview.trim()) {
      const ok = window.confirm('尚未填写作品名等基础信息，仍要创建项目吗？')
      if (!ok) return
    }
    persistProject({ skipRich: false })
  }

  const handleSkip = () => {
    const ok = window.confirm('跳过辅助设定，直接创建空白项目并进入编辑器？')
    if (!ok) return
    persistProject({ skipRich: true })
  }

  const modalFooter = (onSave) => (
    <>
      <Button variant="ghost" onClick={closeModal}>
        取消
      </Button>
      <Button variant="primary" onClick={onSave}>
        保存
      </Button>
    </>
  )

  return (
    <div className="onboarding-page">
      <header className="onboarding-page__header">
        <Link to="/" className="onboarding-page__back">
          <ArrowLeft size={16} />
          返回项目列表
        </Link>
        <span className="onboarding-page__step">新建项目</span>
        <Button variant="ghost" onClick={handleSkip} disabled={submitting}>
          跳过 AI 辅助
        </Button>
      </header>

      <div className="onboarding-page__body">
        <section className="onboarding-page__ai-bar">
          <div className="onboarding-page__ai-copy">
            <h1>AI 辅助创作起点</h1>
            <p>
              可一键生成全部设定；也可先手动填写任意部分，再基于已有内容生成剩余项。
            </p>
          </div>
          <div className="onboarding-page__ai-actions">
            <button
              type="button"
              className="onboarding-page__btn-ai"
              onClick={() => runAiGenerate()}
              disabled={Boolean(aiGenerating)}
            >
              <Sparkles size={16} />
              {aiGenerating === 'all' ? '生成中…' : 'AI 一键生成全部'}
            </button>
            <Button variant="primary" onClick={handleConfirm} disabled={submitting}>
              {submitting ? '创建中…' : '确认并创建'}
            </Button>
          </div>
        </section>

        {error ? <div className="onboarding-page__error">{error}</div> : null}
        {notice ? <div className="onboarding-page__notice">{notice}</div> : null}

        <div className="onboarding-page__grid">
          <div className="onboarding-page__col">
            <GenreWorldviewSection
              title={title}
              onTitleChange={setTitle}
              genre={genre}
              customGenreOpen={customGenreOpen}
              customGenre={customGenre}
              onSelectGenre={selectGenre}
              onOpenCustomGenre={() => {
                setCustomGenreOpen(true)
                setCustomGenre(GENRE_PRESETS.includes(genre) ? '' : genre)
              }}
              onCustomGenreChange={setCustomGenre}
              onConfirmCustomGenre={confirmCustomGenre}
              onCloseCustomGenre={() => setCustomGenreOpen(false)}
              worldview={worldview}
              onWorldviewChange={setWorldview}
              onOpenWorldviewModal={openWorldviewModal}
              onAiGenerate={() => runAiGenerate('worldview')}
              aiGenerating={aiGenerating === 'worldview'}
            />
            <StoryCoreSection
              core={core}
              onCoreChange={(patch) => setCore((c) => ({ ...c, ...patch }))}
              onAiGenerate={() => runAiGenerate('story_core')}
              aiGenerating={aiGenerating === 'story_core'}
            />
          </div>

          <div className="onboarding-page__col">
            <CharactersSection
              characters={characters}
              onEditCharacter={openCharacterModal}
              onRemoveCharacter={removeCharacter}
              onAddCharacter={() => openCharacterModal()}
              onAiGenerate={() => runAiGenerate('characters')}
              aiGenerating={aiGenerating === 'characters'}
            />
            <OutlineSection
              synopsis={synopsis}
              onSynopsisChange={setSynopsis}
              volumes={volumes}
              onOpenBriefModal={openBriefModal}
              onEditVolume={openVolumeModal}
              onRemoveVolume={removeVolume}
              onAddVolume={() => openVolumeModal()}
              onAiGenerate={() => runAiGenerate('outline')}
              aiGenerating={aiGenerating === 'outline'}
            />
          </div>
        </div>

        <footer className="onboarding-page__footer">
          <p className="onboarding-page__footer-hint">
            已填写的部分会作为 AI 生成的上下文；空白项可单独或批量生成。
          </p>
          <div className="onboarding-page__status">
            <StatusItem done={status.genre} label="题材" />
            <StatusItem done={status.core} label="内核" />
            <StatusItem done={status.characters} label="角色" />
            <StatusItem done={status.outline} label="大纲" />
          </div>
        </footer>
      </div>

      <Modal
        open={modal?.type === 'worldview'}
        title="编辑世界观"
        width={720}
        className="modal-dialog--wide"
        onClose={closeModal}
        headerActions={
          <button
            type="button"
            className="onboarding-page__btn-ai onboarding-page__btn-ai--modal"
            onClick={() => runAiGenerate('worldview')}
          >
            <Sparkles size={14} />
            AI 生成
          </button>
        }
        footer={modalFooter(saveWorldviewModal)}
      >
        <p className="onboarding-modal-hint">
          描述世界背景、时代、力量体系、地理格局等。支持长文本。
        </p>
        <textarea
          className="onboarding-modal-editor"
          value={draft?.text || ''}
          onChange={(e) => setDraft({ text: e.target.value })}
          placeholder="在此处输入世界观、时空背景、小说核心理念、设定等内容。"
        />
        <div className="onboarding-modal-count">{countChars(draft?.text)} 字</div>
      </Modal>

      <Modal
        open={modal?.type === 'brief'}
        title="编辑全书概要"
        width={640}
        onClose={closeModal}
        footer={modalFooter(saveBriefModal)}
      >
        <p className="onboarding-modal-hint">概括全书主线、高潮与结局走向。</p>
        <textarea
          className="onboarding-modal-editor"
          value={draft?.text || ''}
          onChange={(e) => setDraft({ text: e.target.value })}
        />
        <div className="onboarding-modal-count">{countChars(draft?.text)} 字</div>
      </Modal>

      <CharacterEditModal
        open={modal?.type === 'character'}
        mode={modal?.mode}
        draft={draft}
        onDraftChange={setDraft}
        onClose={closeModal}
        onSave={saveCharacterModal}
      />

      <Modal
        open={modal?.type === 'volume'}
        title={
          modal?.mode === 'edit'
            ? `编辑卷 · ${draft?.label || draft?.name || ''}`
            : '添加卷'
        }
        width={480}
        onClose={closeModal}
        footer={modalFooter(saveVolumeModal)}
      >
        <div className="onboarding-modal-field">
          <label>卷序</label>
          <span className="onboarding-volume-badge">{draft?.label || '新卷'}</span>
        </div>
        <div className="onboarding-modal-field">
          <label htmlFor="vol-name">卷名</label>
          <input
            id="vol-name"
            value={draft?.name || ''}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="例如：残剑"
          />
        </div>
        <div className="onboarding-modal-field">
          <label htmlFor="vol-summary">本卷梗概</label>
          <textarea
            id="vol-summary"
            value={draft?.summary || ''}
            onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
            placeholder="本卷主要事件与转折"
          />
        </div>
      </Modal>
    </div>
  )
}
