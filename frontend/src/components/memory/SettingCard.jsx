import { Maximize2, Trash2 } from 'lucide-react'

export function SettingCard({
  title,
  content,
  selected,
  constrained = true,
  onExpand,
  onDelete,
  emptyText = '暂无内容',
}) {
  return (
    <article
      className={`memory-card${constrained ? ' memory-card--constrained' : ' memory-card--free'}${selected ? ' is-selected' : ''}`}
    >
      <header className="memory-card__head">
        <h3 className="memory-card__title">{title || '未命名'}</h3>
        <div className="memory-card__actions">
          {onExpand ? (
            <button
              type="button"
              className="memory-card__icon-btn"
              aria-label="展开编辑"
              title="展开编辑"
              onClick={onExpand}
            >
              <Maximize2 size={15} />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="memory-card__icon-btn"
              aria-label="删除"
              title="删除"
              onClick={onDelete}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </header>
      <div className="memory-card__scroll">
        <p className="memory-card__text">
          {(content || '').trim() || emptyText}
        </p>
      </div>
    </article>
  )
}
