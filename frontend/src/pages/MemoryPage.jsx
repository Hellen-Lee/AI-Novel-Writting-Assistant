import { useParams } from 'react-router-dom'
import { CardWorkspace } from '../components/memory/CardWorkspace'
import { CategorySidebar } from '../components/memory/CategorySidebar'
import { CategoryToolbar } from '../components/memory/CategoryToolbar'
import { EntryEditModal } from '../components/memory/EntryEditModal'
import { useMemoryPage } from '../components/memory/useMemoryPage'
import './MemoryPage.css'

/** 设定管理页 — 设计对照：Review/Screen/设定库-*（yqU0z / xfaql / rgq8E / B0LJB） */
export default function MemoryPage() {
  const { projectId } = useParams()
  const {
    memory,
    meta,
    outline,
    category,
    categoryMeta,
    selectedId,
    editTarget,
    draft,
    modalOpen,
    loading,
    saving,
    dirty,
    error,
    setError,
    updateDraft,
    switchCategory,
    openEntryEdit,
    openWorldviewHero,
    openSynopsisEdit,
    openVolumeEdit,
    closeEdit,
    handleCreate,
    handleDelete,
    handleSave,
  } = useMemoryPage(projectId)

  if (loading) {
    return (
      <div className="memory-page memory-page--loading">
        <p>加载设定中…</p>
      </div>
    )
  }

  return (
    <div className="memory-page">
      <CategorySidebar
        memory={memory}
        outline={outline}
        activeCategory={category}
        onSelect={switchCategory}
      />

      <div className="memory-page__workspace">
        {error ? (
          <div className="memory-page__banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}>
              关闭
            </button>
          </div>
        ) : null}

        <CategoryToolbar
          category={category}
          categoryMeta={categoryMeta}
          memory={memory}
          outline={outline}
          onCreate={handleCreate}
        />

        <div className="memory-page__cards">
          <CardWorkspace
            category={category}
            memory={memory}
            meta={meta}
            outline={outline}
            selectedId={selectedId}
            onOpenEntry={openEntryEdit}
            onOpenHero={openWorldviewHero}
            onOpenSynopsis={openSynopsisEdit}
            onOpenVolume={openVolumeEdit}
            onDeleteEntry={handleDelete}
            onDeleteVolume={handleDelete}
            onAddVolume={handleCreate}
          />
        </div>
      </div>

      <EntryEditModal
        open={modalOpen}
        editTarget={editTarget}
        draft={draft}
        saving={saving}
        dirty={dirty}
        onDraftChange={updateDraft}
        onSave={handleSave}
        onClose={closeEdit}
      />
    </div>
  )
}
