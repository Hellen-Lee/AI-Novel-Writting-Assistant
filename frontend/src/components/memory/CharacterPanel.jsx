import { CharacterCard } from './CharacterCard'

export function CharacterPanel({
  entries,
  selectedId,
  onOpenEntry,
  onDeleteEntry,
}) {
  if (!entries.length) {
    return (
      <p className="memory-page__empty">
        暂无人物。点击右上角「新建人物」创建角色设定。
      </p>
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
      </div>
    </div>
  )
}
