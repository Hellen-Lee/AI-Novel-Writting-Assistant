import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../../api/client'
import {
  createMemoryEntry,
  deleteMemoryEntry,
  getMemory,
  updateMemoryEntry,
} from '../../api/memory'
import { getProject, updateProject } from '../../api/projects'
import {
  createLocalId,
  volumeLabelFromIndex,
} from '../../utils/onboarding'
import { useEditorChrome } from '../../stores/useEditorChrome'
import {
  DEFAULT_ENTRY_NAME,
  EMPTY_MEMORY,
  PRIMARY_WORLDVIEW_NAME,
  draftToPayload,
  entryToDraft,
  getCategoryMeta,
  isMemoryCategory,
  isOutlineCategory,
  splitWorldviewEntries,
} from './constants'

export function useMemoryPage(projectId) {
  const { setSaveStatus } = useEditorChrome()
  const [memory, setMemory] = useState(EMPTY_MEMORY)
  const [meta, setMeta] = useState({ name: '', genre: '' })
  const [outline, setOutline] = useState({ synopsis: '', volumes: [] })
  const [category, setCategory] = useState('worldview')
  const [selectedId, setSelectedId] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  const draftRef = useRef(null)
  const dirtyRef = useRef(false)
  const categoryRef = useRef(category)
  const selectedIdRef = useRef(selectedId)
  const editTargetRef = useRef(null)
  const metaRef = useRef(meta)
  const outlineRef = useRef(outline)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  useEffect(() => {
    categoryRef.current = category
  }, [category])
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])
  useEffect(() => {
    editTargetRef.current = editTarget
  }, [editTarget])
  useEffect(() => {
    metaRef.current = meta
  }, [meta])
  useEffect(() => {
    outlineRef.current = outline
  }, [outline])

  useEffect(() => {
    setSaveStatus(saving ? 'saving' : dirty ? 'dirty' : 'saved')
  }, [dirty, saving, setSaveStatus])

  useEffect(() => {
    return () => setSaveStatus('saved')
  }, [setSaveStatus])

  const categoryMeta = getCategoryMeta(category)
  const entries = isMemoryCategory(category) ? memory[category] || [] : []

  const clearDraftState = useCallback(() => {
    setSelectedId(null)
    setEditTarget(null)
    setDraft(null)
    setDirty(false)
    dirtyRef.current = false
  }, [])

  const openDraft = useCallback((target, nextDraft) => {
    setEditTarget(target)
    setSelectedId(target?.id || null)
    setDraft(nextDraft)
    setDirty(false)
    dirtyRef.current = false
  }, [])

  const confirmDiscardIfDirty = useCallback(() => {
    if (!dirtyRef.current) return true
    return window.confirm('有未保存的修改，确定放弃吗？')
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [memData, project] = await Promise.all([
        getMemory(projectId),
        getProject(projectId),
      ])
      const nextMemory = {
        worldview: memData.worldview || [],
        characters: memData.characters || [],
        story_core: memData.story_core || [],
      }
      setMemory(nextMemory)
      setMeta({
        name: project?.meta?.name || '',
        genre: project?.meta?.genre || '',
      })
      setOutline({
        synopsis: project?.outline?.synopsis || '',
        volumes: project?.outline?.volumes || [],
      })
      clearDraftState()
      setCategory('worldview')
    } catch (err) {
      setError(getErrorMessage(err, '加载设定失败'))
      setMemory(EMPTY_MEMORY)
      setMeta({ name: '', genre: '' })
      setOutline({ synopsis: '', volumes: [] })
      clearDraftState()
    } finally {
      setLoading(false)
    }
  }, [projectId, clearDraftState])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const persistDraft = useCallback(async () => {
    const currentDraft = draftRef.current
    const target = editTargetRef.current
    if (!currentDraft || !target || !dirtyRef.current) return true

    setSaving(true)
    setError('')
    try {
      if (target.kind === 'memory') {
        const payload = draftToPayload(target.category, currentDraft)
        if (!payload.name) {
          setError('名称不能为空')
          return false
        }
        const updated = await updateMemoryEntry(
          projectId,
          target.category,
          target.id,
          payload,
        )
        setMemory((prev) => ({
          ...prev,
          [target.category]: (prev[target.category] || []).map((item) =>
            item.id === target.id ? updated : item,
          ),
        }))
        setDraft(entryToDraft(target.category, updated))
        setDirty(false)
        dirtyRef.current = false
        return true
      }

      if (target.kind === 'worldview_hero') {
        const name = (currentDraft.projectName || '').trim() || '未命名作品'
        const genre = (currentDraft.genre || '').trim()
        const content = (currentDraft.content || '').trim()
        await updateProject(projectId, { name, genre })
        setMeta({ name, genre })

        let primaryId = target.id
        if (primaryId) {
          const updated = await updateMemoryEntry(
            projectId,
            'worldview',
            primaryId,
            { name: PRIMARY_WORLDVIEW_NAME, content, tags: [] },
          )
          setMemory((prev) => ({
            ...prev,
            worldview: (prev.worldview || []).map((item) =>
              item.id === primaryId ? updated : item,
            ),
          }))
          primaryId = updated.id
        } else if (content) {
          const created = await createMemoryEntry(projectId, 'worldview', {
            name: PRIMARY_WORLDVIEW_NAME,
            content,
            tags: [],
          })
          setMemory((prev) => ({
            ...prev,
            worldview: [created, ...(prev.worldview || [])],
          }))
          primaryId = created.id
          setEditTarget((prev) =>
            prev ? { ...prev, id: primaryId } : prev,
          )
          setSelectedId(primaryId)
        }
        setDraft((d) =>
          d
            ? {
                ...d,
                projectName: name,
                genre,
                content,
                id: primaryId || d.id,
              }
            : d,
        )
        setDirty(false)
        dirtyRef.current = false
        return true
      }

      if (target.kind === 'synopsis') {
        const synopsis = (currentDraft.synopsis || '').trim()
        await updateProject(projectId, { synopsis })
        setOutline((prev) => ({ ...prev, synopsis }))
        setDirty(false)
        dirtyRef.current = false
        return true
      }

      if (target.kind === 'volume') {
        const volumes = outlineRef.current.volumes || []
        const nextVolumes = volumes.map((vol) =>
          vol.id === target.id
            ? {
                ...vol,
                label: (currentDraft.label || '').trim() || vol.label,
                name: (currentDraft.name || '').trim(),
                summary: (currentDraft.summary || '').trim(),
              }
            : vol,
        )
        await updateProject(projectId, { volumes: nextVolumes })
        setOutline((prev) => ({ ...prev, volumes: nextVolumes }))
        setDirty(false)
        dirtyRef.current = false
        return true
      }

      return true
    } catch (err) {
      setError(getErrorMessage(err, '保存设定失败'))
      return false
    } finally {
      setSaving(false)
    }
  }, [projectId])

  const updateDraft = useCallback((updater) => {
    setDraft((prev) => {
      if (!prev) return prev
      return typeof updater === 'function' ? updater(prev) : updater
    })
    setDirty(true)
    dirtyRef.current = true
  }, [])

  const switchCategory = useCallback(
    (nextCategory) => {
      if (nextCategory === categoryRef.current) return
      if (!confirmDiscardIfDirty()) return
      clearDraftState()
      setCategory(nextCategory)
    },
    [confirmDiscardIfDirty, clearDraftState],
  )

  const openEntryEdit = useCallback(
    (entryId) => {
      const current = editTargetRef.current
      if (current?.kind === 'memory' && current.id === entryId) return
      if (!confirmDiscardIfDirty()) return
      const cat = categoryRef.current
      if (!isMemoryCategory(cat)) return
      const list = memory[cat] || []
      const entry = list.find((item) => item.id === entryId)
      if (!entry) return
      openDraft(
        { kind: 'memory', category: cat, id: entry.id },
        entryToDraft(cat, entry),
      )
    },
    [confirmDiscardIfDirty, memory, openDraft],
  )

  const openWorldviewHero = useCallback(() => {
    if (editTargetRef.current?.kind === 'worldview_hero') return
    if (!confirmDiscardIfDirty()) return
    const { primary } = splitWorldviewEntries(memory.worldview)
    openDraft(
      {
        kind: 'worldview_hero',
        id: primary?.id || null,
        category: 'worldview',
      },
      {
        id: primary?.id || '',
        projectName: metaRef.current.name || '',
        genre: metaRef.current.genre || '',
        content: primary?.content || '',
        updated_at: primary?.updated_at || '',
      },
    )
  }, [confirmDiscardIfDirty, memory.worldview, openDraft])

  const openSynopsisEdit = useCallback(() => {
    if (editTargetRef.current?.kind === 'synopsis') return
    if (!confirmDiscardIfDirty()) return
    openDraft(
      { kind: 'synopsis', id: 'synopsis' },
      { synopsis: outlineRef.current.synopsis || '' },
    )
  }, [confirmDiscardIfDirty, openDraft])

  const openVolumeEdit = useCallback(
    (volumeId) => {
      const current = editTargetRef.current
      if (current?.kind === 'volume' && current.id === volumeId) return
      if (!confirmDiscardIfDirty()) return
      const vol = (outlineRef.current.volumes || []).find((v) => v.id === volumeId)
      if (!vol) return
      openDraft(
        { kind: 'volume', id: vol.id },
        {
          id: vol.id,
          label: vol.label || '',
          name: vol.name || '',
          summary: vol.summary || '',
        },
      )
    },
    [confirmDiscardIfDirty, openDraft],
  )

  const closeEdit = useCallback(() => {
    if (!confirmDiscardIfDirty()) return
    clearDraftState()
  }, [confirmDiscardIfDirty, clearDraftState])

  const handleCreate = useCallback(async () => {
    if (!confirmDiscardIfDirty()) return
    setError('')
    const cat = categoryRef.current

    if (isOutlineCategory(cat)) {
      const volumes = outlineRef.current.volumes || []
      const next = {
        id: createLocalId('vol'),
        label: volumeLabelFromIndex(volumes.length),
        name: '',
        summary: '',
      }
      const nextVolumes = [...volumes, next]
      try {
        await updateProject(projectId, { volumes: nextVolumes })
        setOutline((prev) => ({ ...prev, volumes: nextVolumes }))
        openDraft(
          { kind: 'volume', id: next.id },
          {
            id: next.id,
            label: next.label,
            name: '',
            summary: '',
          },
        )
      } catch (err) {
        setError(getErrorMessage(err, '添加分卷失败'))
      }
      return
    }

    if (!isMemoryCategory(cat)) return

    const payload =
      cat === 'characters'
        ? {
            name: DEFAULT_ENTRY_NAME[cat],
            profile: '',
            relationship: [],
            tags: [],
          }
        : {
            name: DEFAULT_ENTRY_NAME[cat],
            content: '',
            tags: [],
          }

    try {
      const created = await createMemoryEntry(projectId, cat, payload)
      setMemory((prev) => ({
        ...prev,
        [cat]: [...(prev[cat] || []), created],
      }))
      openDraft(
        { kind: 'memory', category: cat, id: created.id },
        entryToDraft(cat, created),
      )
    } catch (err) {
      setError(getErrorMessage(err, '新建设定失败'))
    }
  }, [confirmDiscardIfDirty, projectId, openDraft])

  const handleDelete = useCallback(
    async (entryIdArg) => {
      const cat = categoryRef.current
      const entryId = entryIdArg || selectedIdRef.current
      if (!entryId) return

      if (isOutlineCategory(cat) || editTargetRef.current?.kind === 'volume') {
        const volumes = outlineRef.current.volumes || []
        const target = volumes.find((v) => v.id === entryId)
        const name = target?.name || target?.label || '该分卷'
        if (!window.confirm(`确定删除「${name}」？此操作不可撤销。`)) return
        const nextVolumes = volumes.filter((v) => v.id !== entryId)
        setError('')
        try {
          await updateProject(projectId, { volumes: nextVolumes })
          setOutline((prev) => ({ ...prev, volumes: nextVolumes }))
          if (selectedIdRef.current === entryId) clearDraftState()
        } catch (err) {
          setError(getErrorMessage(err, '删除分卷失败'))
        }
        return
      }

      if (!isMemoryCategory(cat)) return
      const list = memory[cat] || []
      const target = list.find((item) => item.id === entryId)
      const name = target?.name || '该条目'
      if (!window.confirm(`确定删除「${name}」？此操作不可撤销。`)) return

      setError('')
      try {
        await deleteMemoryEntry(projectId, cat, entryId)
        setMemory((prev) => ({
          ...prev,
          [cat]: (prev[cat] || []).filter((item) => item.id !== entryId),
        }))
        if (selectedIdRef.current === entryId) clearDraftState()
      } catch (err) {
        setError(getErrorMessage(err, '删除设定失败'))
      }
    },
    [memory, projectId, clearDraftState],
  )

  const handleSave = useCallback(async () => {
    await persistDraft()
  }, [persistDraft])

  return {
    memory,
    meta,
    outline,
    category,
    categoryMeta,
    entries,
    selectedId,
    editTarget,
    draft,
    modalOpen: Boolean(editTarget && draft),
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
  }
}
