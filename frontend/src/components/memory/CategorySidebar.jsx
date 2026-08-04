import { MEMORY_CATEGORIES } from './constants'

export function CategorySidebar({ memory, outline, activeCategory, onSelect }) {
  const memoryTotal = MEMORY_CATEGORIES.filter((c) => !c.isOutline).reduce(
    (sum, cat) => sum + (memory[cat.key]?.length || 0),
    0,
  )
  const outlineCount =
    (outline?.synopsis?.trim() ? 1 : 0) + (outline?.volumes?.length || 0)
  const total = memoryTotal + outlineCount

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

      <div className="memory-page__rail-hint">
        <div className="memory-page__rail-hint-title">设定库</div>
        <p className="memory-page__rail-hint-body">
          {total > 0
            ? `目前已有 ${total} 条设定，写入后供 AI 续写引用`
            : '分类管理设定，写入后供 AI 续写引用'}
        </p>
      </div>
    </aside>
  )
}
