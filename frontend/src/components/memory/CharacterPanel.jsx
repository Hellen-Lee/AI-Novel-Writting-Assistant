import { Plus } from 'lucide-react'
import { CharacterCard } from './CharacterCard'

/** 网格末尾「添加人物」占位卡 — 设计稿 yqU0z HCmi4 */
function AddCharacterCard({ onAdd }) {
  return (
    <button
      type="button"
      className="memory-card memory-card--add"
      onClick={onAdd}
      aria-label="添加人物"
    >
      <span className="memory-card__add-circle">
        <Plus size={26} strokeWidth={2} />
      </span>
      <span className="memory-card__add-label">添加人物</span>
    </button>
  )
}

export function CharacterPanel({
  entries,
  selectedId,
  onOpenEntry,
  onDeleteEntry,
  onCreate,
}) {
  if (!entries.length) {
    return (
      <div className="memory-workspace memory-workspace--characters">
        <button
          type="button"
          className="memory-card memory-card--add memory-card--add--empty"
          onClick={onCreate}
          aria-label="添加人物"
        >
          <span className="memory-card__add-circle">
            <Plus size={26} strokeWidth={2} />
          </span>
          <span className="memory-card__add-label">添加人物</span>
        </button>
      </div>
    )
  }

  return (
    <div className="memory-workspace memory-workspace--characters">
      <div className="memory-card-grid">
        {entries.map((entry) => (
          <CharacterCard
            key={entry.id}
            entry={entry}
            selected={selectedId === entry.id}
            onExpand={() => onOpenEntry(entry.id)}
            onDelete={() => onDeleteEntry(entry.id)}
            onAddRelation={() => onOpenEntry(entry.id)}
          />
        ))}
        <AddCharacterCard onAdd={onCreate} />
      </div>
    </div>
  )
}
