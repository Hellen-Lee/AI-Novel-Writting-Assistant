import { Expand, Maximize2 } from 'lucide-react'
import { GENRE_PRESETS, splitWorldviewEntries } from './constants'
import { SettingCard } from './SettingCard'

export function WorldviewPanel({
  meta,
  entries,
  selectedId,
  onOpenHero,
  onOpenEntry,
  onDeleteEntry,
  onSelectGenre,
}) {
  const { primary, secondary } = splitWorldviewEntries(entries)
  const content = (primary?.content || '').trim()

  return (
    <div className="memory-workspace memory-workspace--worldview">
      <article
        className={`memory-card memory-card--hero${selectedId === (primary?.id || 'worldview-hero') ? ' is-selected' : ''}`}
      >
        <header className="memory-card__head">
          <h3 className="memory-card__title">题材 & 世界观</h3>
          <button
            type="button"
            className="memory-card__icon-btn"
            aria-label="展开编辑"
            title="展开编辑"
            onClick={onOpenHero}
          >
            <Maximize2 size={15} />
          </button>
        </header>

        <div className="memory-card__hero-fields">
          <div className="memory-page__field">
            <label>作品暂定名</label>
            <div className="memory-card__readonly-input">
              {meta.name || '未命名作品'}
            </div>
          </div>

          <div className="memory-page__field">
            <span className="memory-page__field-label">题材分类</span>
            <div className="memory-page__genre-chips">
              {GENRE_PRESETS.map((item) => {
                const active = meta.genre === item
                return (
                  <button
                    key={item}
                    type="button"
                    className={`memory-page__genre-chip${active ? ' is-active' : ''}`}
                    onClick={() => onSelectGenre(item)}
                  >
                    {item}
                  </button>
                )
              })}
              {meta.genre && !GENRE_PRESETS.includes(meta.genre) ? (
                <span className="memory-page__genre-chip is-active">
                  {meta.genre}
                </span>
              ) : null}
            </div>
          </div>

          <div className="memory-page__field">
            <div className="memory-card__hint-row">
              <label>世界观简述</label>
              <button
                type="button"
                className="memory-card__expand-hint"
                onClick={onOpenHero}
              >
                <Expand size={12} />
                点击展开编辑
              </button>
            </div>
            <button
              type="button"
              className="memory-card__preview"
              onClick={onOpenHero}
            >
              {content || '点击填写世界观简述…'}
            </button>
          </div>
        </div>
      </article>

      {secondary.length > 0 ? (
        <div className="memory-card-grid">
          {secondary.map((entry) => (
            <SettingCard
              key={entry.id}
              title={entry.name}
              content={entry.content}
              constrained={false}
              selected={selectedId === entry.id}
              onExpand={() => onOpenEntry(entry.id)}
              onDelete={() => onDeleteEntry(entry.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
