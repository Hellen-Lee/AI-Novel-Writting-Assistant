import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../../api/client'
import {
  createMemoryEntry,
  deleteMemoryEntry,
  getMemory,
  updateMemoryEntry,
} from '../../api/memory'
import { useEditorChrome } from '../../stores/useEditorChrome'
import {
  DEFAULT_ENTRY_NAME,
  EMPTY_MEMORY,
  draftToPayload,
  entryToDraft,
  getCategoryMeta,
} from './constants'

const AUTOSAVE_MS = 700

export function useMemoryPage(projectId) {
  const { setSaveStatus } = useEditorChrome()
  const [memory, setMemory] = useState(EMPTY_MEMORY)
  const [category, setCategory] = useState('characters')
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  const draftRef = useRef(null)
  const dirtyRef = useRef(false)
  const categoryRef = useRef(category)
  const selectedIdRef = useRef(selectedId)
  const saveTimerRef = useRef(null)
  const skipAutosaveRef = useRef(false)

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
    setSaveStatus(saving ? 'saving' : dirty ? 'dirty' : 'saved')
  }, [dirty, saving, setSaveStatus])

  useEffect(() => {
    return () => setSaveStatus('saved')
  }, [setSaveStatus])

  const entries = memory[category] || []
  const categoryMeta = getCategoryMeta(category)

  const selectEntry = useCallback((cat, entry) => {
    skipAutosaveRef.current = true
    setCategory(cat)
    setSelectedId(entry?.id || null)
    setDraft(entryToDraft(cat, entry))
    setDirty(false)
    dirtyRef.current = false
    queueMicrotask(() => {
      skipAutosaveRef.current = false
    })
  }, [])

  const loadMemory = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getMemory(projectId)
      const next = {
        worldview: data.worldview || [],
        characters: data.characters || [],
        items: data.items || [],
        plot_points: data.plot_points || [],
      }
      setMemory(next)
      const preferred = 'characters'
      const list = next[preferred] || []
      if (list.length > 0) {
        selectEntry(preferred, list[0])
      } else {
        const fallback =
          MEMORY_FIRST_NONEMPTY(next) || { cat: preferred, entry: null }
        if (fallback.entry) {
          selectEntry(fallback.cat, fallback.entry)
        } else {
          selectEntry(preferred, null)
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, '加载设定失败'))
      setMemory(EMPTY_MEMORY)
      selectEntry('characters', null)
    } finally {
      setLoading(false)
    }
  }, [projectId, selectEntry])

  useEffect(() => {
    loadMemory()
  }, [loadMemory])

  const persistDraft = useCallback(
    async ({ silent = false } = {}) => {
      const currentDraft = draftRef.current
      const cat = categoryRef.current
      const entryId = selectedIdRef.current
      if (!currentDraft || !entryId || !dirtyRef.current) return true

      const payload = draftToPayload(cat, currentDraft)
      if (!payload.name) {
        if (!silent) setError('名称不能为空')
        return false
      }

      setSaving(true)
      if (!silent) setError('')
      try {
        const updated = await updateMemoryEntry(
          projectId,
          cat,
          entryId,
          payload,
        )
        setMemory((prev) => ({
          ...prev,
          [cat]: (prev[cat] || []).map((item) =>
            item.id === entryId ? updated : item,
          ),
        }))
        skipAutosaveRef.current = true
        setDraft(entryToDraft(cat, updated))
        setDirty(false)
        dirtyRef.current = false
        queueMicrotask(() => {
          skipAutosaveRef.current = false
        })
        return true
      } catch (err) {
        setError(getErrorMessage(err, '保存设定失败'))
        return false
      } finally {
        setSaving(false)
      }
    },
    [projectId],
  )

  const flushAutosave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    return persistDraft({ silent: true })
  }, [persistDraft])

  const scheduleAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      persistDraft({ silent: true })
    }, AUTOSAVE_MS)
  }, [persistDraft])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const updateDraft = useCallback(
    (updater) => {
      setDraft((prev) => {
        if (!prev) return prev
        const next = typeof updater === 'function' ? updater(prev) : updater
        return next
      })
      if (skipAutosaveRef.current) return
      setDirty(true)
      dirtyRef.current = true
      scheduleAutosave()
    },
    [scheduleAutosave],
  )

  const switchCategory = useCallback(
    async (nextCategory) => {
      if (nextCategory === categoryRef.current) return
      await flushAutosave()
      const list = memory[nextCategory] || []
      selectEntry(nextCategory, list[0] || null)
    },
    [flushAutosave, memory, selectEntry],
  )

  const switchEntry = useCallback(
    async (entryId) => {
      if (entryId === selectedIdRef.current) return
      await flushAutosave()
      const list = memory[categoryRef.current] || []
      const entry = list.find((item) => item.id === entryId) || null
      selectEntry(categoryRef.current, entry)
    },
    [flushAutosave, memory, selectEntry],
  )

  const handleCreate = useCallback(async () => {
    await flushAutosave()
    setError('')
    const cat = categoryRef.current
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
      selectEntry(cat, created)
    } catch (err) {
      setError(getErrorMessage(err, '新建设定失败'))
    }
  }, [flushAutosave, projectId, selectEntry])

  const handleDelete = useCallback(
    async (entryIdArg) => {
      const entryId = entryIdArg || selectedIdRef.current
      const cat = categoryRef.current
      if (!entryId) return
      const list = memory[cat] || []
      const target = list.find((item) => item.id === entryId)
      const name =
        target?.name ||
        (entryId === selectedIdRef.current ? draftRef.current?.name : '') ||
        '该条目'
      if (!window.confirm(`确定删除「${name}」？此操作不可撤销。`)) return

      if (entryId !== selectedIdRef.current) {
        await flushAutosave()
      } else if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      setError('')
      try {
        await deleteMemoryEntry(projectId, cat, entryId)
        setMemory((prev) => {
          const nextList = (prev[cat] || []).filter((item) => item.id !== entryId)
          const next = { ...prev, [cat]: nextList }
          if (entryId === selectedIdRef.current) {
            selectEntry(cat, nextList[0] || null)
          }
          return next
        })
      } catch (err) {
        setError(getErrorMessage(err, '删除设定失败'))
      }
    },
    [flushAutosave, memory, projectId, selectEntry],
  )

  const handleSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await persistDraft({ silent: false })
  }, [persistDraft])

  return {
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
  }
}

function MEMORY_FIRST_NONEMPTY(memory) {
  for (const key of ['characters', 'worldview', 'items', 'plot_points']) {
    const list = memory[key] || []
    if (list.length > 0) return { cat: key, entry: list[0] }
  }
  return null
}
