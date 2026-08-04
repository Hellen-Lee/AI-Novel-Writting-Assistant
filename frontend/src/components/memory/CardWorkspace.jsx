import { CharacterPanel } from './CharacterPanel'
import { OutlinePanel } from './OutlinePanel'
import { StoryCorePanel } from './StoryCorePanel'
import { WorldviewPanel } from './WorldviewPanel'

export function CardWorkspace({
  category,
  memory,
  meta,
  outline,
  selectedId,
  onOpenEntry,
  onOpenHero,
  onOpenSynopsis,
  onOpenVolume,
  onDeleteEntry,
  onDeleteVolume,
  onAddVolume,
}) {
  if (category === 'worldview') {
    return (
      <WorldviewPanel
        meta={meta}
        entries={memory.worldview || []}
        selectedId={selectedId}
        onOpenHero={onOpenHero}
        onOpenEntry={onOpenEntry}
        onDeleteEntry={onDeleteEntry}
      />
    )
  }

  if (category === 'story_core') {
    return (
      <StoryCorePanel
        entries={memory.story_core || []}
        selectedId={selectedId}
        onOpenEntry={onOpenEntry}
        onDeleteEntry={onDeleteEntry}
      />
    )
  }

  if (category === 'characters') {
    return (
      <CharacterPanel
        entries={memory.characters || []}
        selectedId={selectedId}
        onOpenEntry={onOpenEntry}
        onDeleteEntry={onDeleteEntry}
      />
    )
  }

  if (category === 'outline') {
    return (
      <OutlinePanel
        outline={outline}
        selectedId={selectedId}
        onOpenSynopsis={onOpenSynopsis}
        onOpenVolume={onOpenVolume}
        onDeleteVolume={onDeleteVolume}
        onAddVolume={onAddVolume}
      />
    )
  }

  return null
}
