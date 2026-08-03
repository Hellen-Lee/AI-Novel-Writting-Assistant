import { Plus, Trash2 } from 'lucide-react'
import {
  entryRoleLabel,
  entrySnippet,
  isCharacterCategory,
} from './constants'

export function EntryList({
  categoryLabel,
  category,
  entries,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}) {
  return (
    <section className="memory-page__list">
      <header className="memory-page__list-head">
        <h2>{categoryLabel}</h2>
        <button
          type="button"
          className="memory-page__add-btn"
          onClick={onCreate}
        >
          <Plus size={12} strokeWidth={2.5} />
          新增
        </button>
      </header>

      <div className="memory-page__entries" role="list">
        {entries.length === 0 ? (
          <p className="memory-page__list-empty">
            暂无条目。点击右上角「新增」创建。
          </p>
        ) : (
          entries.map((entry) => {
            const active = entry.id === selectedId
            const role = isCharacterCategory(category)
              ? entryRoleLabel(entry)
              : (entry.tags || []).slice(0, 2).join(' · ')
            const snippet = entrySnippet(category, entry)
            return (
              <div
                key={entry.id}
                role="listitem"
                className={`memory-page__entry${active ? ' is-active' : ''}`}
              >
                <button
                  type="button"
                  className="memory-page__entry-main"
                  onClick={() => onSelect(entry.id)}
                >
                  <div className="memory-page__entry-head">
                    <span className="memory-page__entry-name">
                      {entry.name || '未命名'}
                    </span>
                    {role ? (
                      <span className="memory-page__entry-role">{role}</span>
                    ) : null}
                  </div>
                  <p className="memory-page__entry-snippet">{snippet}</p>
                </button>
                <button
                  type="button"
                  className="memory-page__entry-delete"
                  aria-label={`删除 ${entry.name || '条目'}`}
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(entry.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
