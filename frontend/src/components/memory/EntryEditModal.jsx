import { Check } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { GENRE_PRESETS, isCharacterCategory } from './constants'
import { RelationshipRows } from './RelationshipRows'

export function EntryEditModal({
  open,
  editTarget,
  draft,
  saving,
  dirty,
  onDraftChange,
  onSave,
  onClose,
}) {
  if (!open || !draft || !editTarget) return null

  const title = modalTitle(editTarget, draft)

  return (
    <Modal
      open={open}
      title={title}
      width={560}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {dirty ? '取消' : '关闭'}
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={saving || !dirty}
          >
            <Check size={14} strokeWidth={2.5} />
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div className="memory-page__modal-body">
        {editTarget.kind === 'worldview_hero' ? (
          <WorldviewHeroFields draft={draft} onDraftChange={onDraftChange} />
        ) : null}
        {editTarget.kind === 'memory' &&
        isCharacterCategory(editTarget.category) ? (
          <CharacterFields draft={draft} onDraftChange={onDraftChange} />
        ) : null}
        {editTarget.kind === 'memory' &&
        !isCharacterCategory(editTarget.category) ? (
          <GenericFields draft={draft} onDraftChange={onDraftChange} />
        ) : null}
        {editTarget.kind === 'synopsis' ? (
          <SynopsisFields draft={draft} onDraftChange={onDraftChange} />
        ) : null}
        {editTarget.kind === 'volume' ? (
          <VolumeFields draft={draft} onDraftChange={onDraftChange} />
        ) : null}
      </div>
    </Modal>
  )
}

function modalTitle(editTarget, draft) {
  if (editTarget.kind === 'worldview_hero') return '编辑世界观'
  if (editTarget.kind === 'synopsis') return '编辑全书概要'
  if (editTarget.kind === 'volume') {
    return `编辑分卷 · ${draft.label || draft.name || ''}`
  }
  if (editTarget.category === 'characters') {
    return `编辑人物 · ${draft.name || ''}`
  }
  if (editTarget.category === 'story_core') {
    return `编辑故事内核 · ${draft.name || ''}`
  }
  return `编辑设定 · ${draft.name || ''}`
}

function WorldviewHeroFields({ draft, onDraftChange }) {
  return (
    <>
      <div className="memory-page__field">
        <label htmlFor="memory-project-name">作品暂定名</label>
        <input
          id="memory-project-name"
          value={draft.projectName || ''}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, projectName: e.target.value }))
          }
          placeholder="例如：星渊剑主"
        />
      </div>
      <div className="memory-page__field">
        <label>题材分类</label>
        <div className="memory-page__genre-chips">
          {GENRE_PRESETS.map((item) => {
            const active = draft.genre === item
            return (
              <button
                key={item}
                type="button"
                className={`memory-page__genre-chip${active ? ' is-active' : ''}`}
                onClick={() => onDraftChange((d) => ({ ...d, genre: item }))}
              >
                {item}
              </button>
            )
          })}
        </div>
        <input
          value={
            draft.genre && !GENRE_PRESETS.includes(draft.genre)
              ? draft.genre
              : ''
          }
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, genre: e.target.value }))
          }
          placeholder="或填写自定义题材"
        />
      </div>
      <div className="memory-page__field">
        <label htmlFor="memory-worldview-content">世界观简述</label>
        <textarea
          id="memory-worldview-content"
          value={draft.content || ''}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, content: e.target.value }))
          }
          placeholder="地理、力量体系、核心设定…"
          rows={10}
        />
      </div>
    </>
  )
}

function CharacterFields({ draft, onDraftChange }) {
  return (
    <>
      <div className="memory-page__field">
        <label htmlFor="memory-name">角色名</label>
        <input
          id="memory-name"
          value={draft.name}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, name: e.target.value }))
          }
          placeholder="例如：林砚"
        />
      </div>
      <div className="memory-page__field">
        <label htmlFor="memory-role">角色定位</label>
        <input
          id="memory-role"
          value={draft.role}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, role: e.target.value }))
          }
          placeholder="例如：主角 / 女主 / 反派"
        />
      </div>
      <div className="memory-page__field">
        <label htmlFor="memory-profile">人物简介</label>
        <textarea
          id="memory-profile"
          value={draft.profile}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, profile: e.target.value }))
          }
          placeholder="性格、身世、能力等"
          rows={5}
        />
      </div>
      <RelationshipRows
        relationship={draft.relationship}
        onChange={(relationship) =>
          onDraftChange((d) => ({ ...d, relationship }))
        }
      />
    </>
  )
}

function GenericFields({ draft, onDraftChange }) {
  return (
    <>
      <div className="memory-page__field">
        <label htmlFor="memory-name">名称</label>
        <input
          id="memory-name"
          value={draft.name}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, name: e.target.value }))
          }
          placeholder="设定名称"
        />
      </div>
      <div className="memory-page__field">
        <label htmlFor="memory-tags">标签</label>
        <input
          id="memory-tags"
          value={draft.tagsText}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, tagsText: e.target.value }))
          }
          placeholder="用逗号分隔"
        />
      </div>
      <div className="memory-page__field">
        <label htmlFor="memory-content">内容</label>
        <textarea
          id="memory-content"
          value={draft.content}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, content: e.target.value }))
          }
          placeholder="详细描述"
          rows={8}
        />
      </div>
    </>
  )
}

function SynopsisFields({ draft, onDraftChange }) {
  return (
    <div className="memory-page__field">
      <label htmlFor="memory-synopsis">全书概要</label>
      <textarea
        id="memory-synopsis"
        value={draft.synopsis || ''}
        onChange={(e) =>
          onDraftChange((d) => ({ ...d, synopsis: e.target.value }))
        }
        placeholder="全书主线概要"
        rows={8}
      />
    </div>
  )
}

function VolumeFields({ draft, onDraftChange }) {
  return (
    <>
      <div className="memory-page__field">
        <label htmlFor="memory-vol-label">卷序标签</label>
        <input
          id="memory-vol-label"
          value={draft.label || ''}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, label: e.target.value }))
          }
          placeholder="例如：第一卷"
        />
      </div>
      <div className="memory-page__field">
        <label htmlFor="memory-vol-name">名称</label>
        <input
          id="memory-vol-name"
          value={draft.name || ''}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, name: e.target.value }))
          }
          placeholder="分卷名称"
        />
      </div>
      <div className="memory-page__field">
        <label htmlFor="memory-vol-summary">概要</label>
        <textarea
          id="memory-vol-summary"
          value={draft.summary || ''}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, summary: e.target.value }))
          }
          placeholder="本卷剧情概要"
          rows={6}
        />
      </div>
    </>
  )
}
