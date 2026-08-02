import './MemoryPage.css'

const CATEGORIES = [
  { key: 'worldview', label: '世界观' },
  { key: 'characters', label: '人物' },
  { key: 'items', label: '物品' },
  { key: 'plot_points', label: '剧情要点' },
]

/** 设定管理页骨架 — 设计对照：Review/Screen/设定库 */
export default function MemoryPage() {
  return (
    <div className="memory-page">
      <aside className="memory-page__sidebar">
        <h2>设定分类</h2>
        <nav className="memory-page__cats" aria-label="设定分类">
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat.key}
              type="button"
              className={`memory-page__cat${i === 1 ? ' is-active' : ''}`}
            >
              {cat.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="memory-page__main">
        <header className="memory-page__main-head">
          <h1>人物</h1>
          <button type="button" className="memory-page__new-btn">
            + 新建
          </button>
        </header>
        <div className="memory-page__content">
          <p>
            分类展示人物、物品、世界观、剧情要点；人物含 profile 与内嵌
            relationship。完整 CRUD 将在 4.5 实现。
          </p>
        </div>
      </section>
    </div>
  )
}
