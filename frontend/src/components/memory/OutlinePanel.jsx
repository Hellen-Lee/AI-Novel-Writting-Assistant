import { Plus } from 'lucide-react'
import { SettingCard } from './SettingCard'

export function OutlinePanel({
  outline,
  selectedId,
  onOpenSynopsis,
  onOpenVolume,
  onDeleteVolume,
  onAddVolume,
}) {
  const volumes = outline?.volumes || []
  const synopsis = outline?.synopsis || ''

  return (
    <div className="memory-workspace memory-workspace--stack">
      <SettingCard
        title="全书概要"
        content={synopsis}
        constrained
        selected={selectedId === 'synopsis'}
        onExpand={onOpenSynopsis}
        emptyText="点击填写全书概要…"
      />

      {volumes.map((vol) => {
        const title = [vol.label, vol.name].filter(Boolean).join(' · ') || '未命名分卷'
        return (
          <SettingCard
            key={vol.id}
            title={title}
            content={vol.summary}
            constrained
            selected={selectedId === vol.id}
            onExpand={() => onOpenVolume(vol.id)}
            onDelete={() => onDeleteVolume(vol.id)}
            emptyText="点击填写本卷概要…"
          />
        )
      })}

      <button
        type="button"
        className="memory-page__add-volume"
        onClick={onAddVolume}
      >
        <span className="memory-page__add-volume-icon">
          <Plus size={14} />
        </span>
        添加分卷
      </button>
    </div>
  )
}
