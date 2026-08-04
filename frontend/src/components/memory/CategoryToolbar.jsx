import { Plus } from 'lucide-react'
import { createButtonLabel, toolbarCountLabel } from './constants'

export function CategoryToolbar({
  category,
  categoryMeta,
  memory,
  outline,
  onCreate,
}) {
  return (
    <header className="memory-page__toolbar">
      <div className="memory-page__toolbar-titles">
        <h2>{categoryMeta.label}</h2>
        <span className="memory-page__toolbar-key">{categoryMeta.keyHint}</span>
      </div>
      <div className="memory-page__toolbar-actions">
        <span className="memory-page__toolbar-count">
          {toolbarCountLabel(category, memory, outline)}
        </span>
        <button
          type="button"
          className="memory-page__add-btn"
          onClick={onCreate}
        >
          <Plus size={12} strokeWidth={2.5} />
          {createButtonLabel(category)}
        </button>
      </div>
    </header>
  )
}
