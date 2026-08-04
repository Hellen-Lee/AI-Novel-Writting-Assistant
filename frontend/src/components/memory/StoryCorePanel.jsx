import { SettingCard } from './SettingCard'

export function StoryCorePanel({
  entries,
  selectedId,
  onOpenEntry,
  onDeleteEntry,
}) {
  if (!entries.length) {
    return (
      <p className="memory-page__empty">
        暂无故事内核。点击右上角「新建内核」添加核心主题、冲突或主线。
      </p>
    )
  }

  return (
    <div className="memory-workspace memory-workspace--stack">
      {entries.map((entry) => (
        <SettingCard
          key={entry.id}
          title={entry.name}
          content={entry.content}
          constrained
          selected={selectedId === entry.id}
          onExpand={() => onOpenEntry(entry.id)}
          onDelete={() => onDeleteEntry(entry.id)}
        />
      ))}
    </div>
  )
}
