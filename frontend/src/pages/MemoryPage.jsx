import { useParams } from 'react-router-dom'
import { CategorySidebar } from '../components/memory/CategorySidebar'
import { EntryDetail } from '../components/memory/EntryDetail'
import { EntryList } from '../components/memory/EntryList'
import { useMemoryPage } from '../components/memory/useMemoryPage'
import './MemoryPage.css'

/** 设定管理页 — 设计对照：Review/Screen/设定库-*（yqU0z / xfaql / rgq8E / B0LJB） */
export default function MemoryPage() {
  const { projectId } = useParams()
  const {
    memory,
    category,
    categoryMeta,
    entries,
    selectedId,
    draft,
    loading,
    saving,
    dirty,
    error,
    setError,
    updateDraft,
    switchCategory,
    switchEntry,
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

        <div className="memory-page__panes">
          <EntryList
            categoryLabel={categoryMeta.label}
            category={category}
            entries={entries}
            selectedId={selectedId}
            onSelect={switchEntry}
            onCreate={handleCreate}
            onDelete={handleDelete}
          />
          <EntryDetail
            category={category}
            categoryLabel={categoryMeta.label}
            draft={draft}
            saving={saving}
            dirty={dirty}
            onDraftChange={updateDraft}
            onSave={handleSave}
            onDelete={() => handleDelete(selectedId)}
          />
        </div>
      </div>
    </div>
  )
}
