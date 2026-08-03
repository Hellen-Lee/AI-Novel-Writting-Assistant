import { Check, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { formatUpdatedAt } from '../../utils/format'
import { isCharacterCategory } from './constants'
import { RelationshipRows } from './RelationshipRows'

export function EntryDetail({
  category,
  categoryLabel,
  draft,
  saving,
  dirty,
  onDraftChange,
  onSave,
  onDelete,
}) {
  if (!draft) {
    return (
      <section className="memory-page__detail memory-page__detail--empty">
        <p>选择左侧条目进行编辑，或点击「新增」创建一条设定。</p>
      </section>
    )
  }

  const character = isCharacterCategory(category)
  const updatedLabel = formatUpdatedAt(draft.updated_at)

  return (
    <section className="memory-page__detail">
      <header className="memory-page__detail-head">
        <div className="memory-page__detail-titles">
          <span className="memory-page__detail-meta">{categoryLabel}设定</span>
          <h1>{draft.name || '未命名'}</h1>
        </div>
        <div className="memory-page__detail-actions">
          {updatedLabel ? (
            <span className="memory-page__detail-updated">
              更新于 {updatedLabel}
            </span>
          ) : null}
          <button
            type="button"
            className="memory-page__icon-danger"
            aria-label="删除条目"
            title="删除"
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={saving || !dirty}
          >
            <Check size={14} strokeWidth={2.5} />
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </header>

      <div className="memory-page__detail-body">
        {character ? (
          <CharacterFields draft={draft} onDraftChange={onDraftChange} />
        ) : (
          <GenericFields draft={draft} onDraftChange={onDraftChange} />
        )}
      </div>
    </section>
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
          rows={4}
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
          placeholder="用逗号分隔，例如：武器，稀有"
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
          rows={10}
        />
      </div>
    </>
  )
}
