import { Maximize2, Plus, Trash2 } from 'lucide-react'
import {
  characterSubtitle,
  entryRoleLabel,
} from './constants'

export function CharacterCard({
  entry,
  selected,
  onExpand,
  onDelete,
  onAddRelation,
}) {
  const role = entryRoleLabel(entry)
  const subtitle = characterSubtitle(entry)
  const relations = (entry.relationship || []).filter((r) => r.type && r.target)

  return (
    <article
      className={`memory-card memory-card--character${selected ? ' is-selected' : ''}`}
    >
      <header className="memory-card__head">
        <div className="memory-card__title-row">
          <h3 className="memory-card__title">{entry.name || '未命名'}</h3>
          {role ? <span className="memory-card__role">{role}</span> : null}
          {subtitle ? (
            <span className="memory-card__subtitle">{subtitle}</span>
          ) : null}
        </div>
        <div className="memory-card__actions">
          <button
            type="button"
            className="memory-card__icon-btn"
            aria-label="展开编辑"
            title="展开编辑"
            onClick={onExpand}
          >
            <Maximize2 size={15} />
          </button>
          <button
            type="button"
            className="memory-card__icon-btn"
            aria-label="删除人物"
            title="删除"
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className="memory-card__body memory-card__body--split">
        <div className="memory-card__col">
          <span className="memory-card__label">人物简介</span>
          <div className="memory-card__scroll">
            <p className="memory-card__text">
              {(entry.profile || '').trim() || '暂无简介'}
            </p>
          </div>
        </div>
        <div className="memory-card__col">
          <div className="memory-card__rel-head">
            <span className="memory-card__label">人物关系</span>
            <button
              type="button"
              className="memory-card__rel-add"
              onClick={onAddRelation}
            >
              <Plus size={12} />
              添加关系
            </button>
          </div>
          <div className="memory-card__scroll memory-card__rel-list">
            {relations.length === 0 ? (
              <p className="memory-card__empty">暂无关系</p>
            ) : (
              relations.map((rel, index) => (
                <div className="memory-card__rel-item" key={`${rel.type}-${rel.target}-${index}`}>
                  <span className="memory-card__rel-type">{rel.type}</span>
                  <span className="memory-card__rel-target">{rel.target}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
