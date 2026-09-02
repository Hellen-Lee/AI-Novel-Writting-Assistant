import { MEMORY_CATEGORIES } from './constants'

export function CategorySidebar({ memory, outline, activeCategory, onSelect }) {
  const outlineCount =
    (outline?.synopsis?.trim() ? 1 : 0) + (outline?.volumes?.length || 0)

  return (
    <aside className="memory-page__sidebar">
      <div className="memory-page__rail-head">
        <span className="memory-page__rail-title">设定分类</span>
      </div>

      <nav className="memory-page__cats" aria-label="设定分类">
        {MEMORY_CATEGORIES.map((cat) => {
          const count = cat.isOutline
            ? outlineCount
            : memory[cat.key]?.length || 0
          const active = cat.key === activeCategory
          return (
            <button
              key={cat.key}
              type="button"
              className={`memory-page__cat${active ? ' is-active' : ''}`}
              onClick={() => onSelect(cat.key)}
            >
              <span className="memory-page__cat-key">{cat.keyHint}</span>
              <span className="memory-page__cat-label">
                {cat.label} · {count}
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
