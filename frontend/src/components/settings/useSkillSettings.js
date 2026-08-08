import { useEffect, useMemo, useState } from 'react'
import { getErrorMessage } from '../../api/client'
import { deleteSkill, getSkill, listSkills, saveSkill } from '../../api/skills'
import {
  EMPTY_SKILL_FORM,
  detailToForm,
  formToPayload,
} from './skillConstants'

export function useSkillSettings(enabled) {
  const [skills, setSkills] = useState([])
  const [loadErrors, setLoadErrors] = useState([])
  const [selectedKey, setSelectedKey] = useState(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState(EMPTY_SKILL_FORM)
  const [savedSnapshot, setSavedSnapshot] = useState(EMPTY_SKILL_FORM)
  const [source, setSource] = useState('custom')
  const [originalName, setOriginalName] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  const builtinSkills = useMemo(
    () => skills.filter((s) => s.source === 'builtin'),
    [skills],
  )
  const customSkills = useMemo(
    () => skills.filter((s) => s.source === 'custom'),
    [skills],
  )

  const canDelete = !isNew && source === 'custom' && Boolean(originalName)
  const canSave = isNew || source === 'custom'
  const readOnly = !isNew && source === 'builtin'

  const reloadList = async ({ preferName } = {}) => {
    const data = await listSkills()
    const items = Array.isArray(data?.skills) ? data.skills : []
    setSkills(items)
    setLoadErrors(Array.isArray(data?.load_errors) ? data.load_errors : [])
    return { items, preferName }
  }

  const selectSkill = async (name) => {
    if (!name) return
    setDetailLoading(true)
    setError('')
    setStatus({ kind: 'idle', message: '' })
    setIsNew(false)
    setSelectedKey(name)
    try {
      const detail = await getSkill(name)
      const next = detailToForm(detail)
      setForm(next)
      setSavedSnapshot(next)
      setSource(detail.source || 'builtin')
      setOriginalName(detail.name)
    } catch (err) {
      setError(getErrorMessage(err, '加载技能详情失败'))
    } finally {
      setDetailLoading(false)
    }
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { items } = await reloadList()
      const first =
        items.find((s) => s.source === 'custom') ||
        items.find((s) => s.source === 'builtin') ||
        null
      if (first) {
        await selectSkill(first.name)
      } else {
        setSelectedKey(null)
        setIsNew(false)
        setForm(EMPTY_SKILL_FORM)
        setSavedSnapshot(EMPTY_SKILL_FORM)
        setOriginalName('')
        setSource('custom')
      }
    } catch (err) {
      setError(getErrorMessage(err, '加载技能列表失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!enabled) return undefined
    load()
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount when tab enabled
  }, [enabled])

  const updateField = (key, value) => {
    if (readOnly) return
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'kind' && value === 'skill') {
        next.system = ''
      }
      return next
    })
    setStatus((prev) =>
      prev.kind === 'success' ? { kind: 'idle', message: '' } : prev,
    )
  }

  const handleNew = () => {
    setIsNew(true)
    setSelectedKey('__new__')
    setSource('custom')
    setOriginalName('')
    setForm(EMPTY_SKILL_FORM)
    setSavedSnapshot(EMPTY_SKILL_FORM)
    setError('')
    setStatus({ kind: 'idle', message: '' })
  }

  const handleSave = async () => {
    if (!canSave) return
    const payload = formToPayload(form)
    if (!payload.name) {
      setError('name 不能为空')
      return
    }
    if (!payload.description) {
      setError('description 不能为空')
      return
    }
    if (!payload.user_template) {
      setError('正文不能为空')
      return
    }
    if (payload.kind === 'quick_action' && !payload.system) {
      setError('kind=quick_action 时 system 必填')
      return
    }

    const pathName = isNew ? payload.name : originalName || payload.name
    setSaving(true)
    setError('')
    try {
      const detail = await saveSkill(pathName, payload)
      await reloadList()
      const next = detailToForm(detail)
      setIsNew(false)
      setSelectedKey(detail.name)
      setForm(next)
      setSavedSnapshot(next)
      setSource(detail.source || 'custom')
      setOriginalName(detail.name)
      setStatus({ kind: 'success', message: '已保存到本地 data/skills' })
    } catch (err) {
      setError(getErrorMessage(err, '保存技能失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!canDelete) return
    const ok = window.confirm(`确定删除自定义技能「${originalName}」？此操作不可撤销。`)
    if (!ok) return
    setDeleting(true)
    setError('')
    try {
      const result = await deleteSkill(originalName)
      const { items } = await reloadList()
      if (result?.restored_builtin && result?.skill) {
        await selectSkill(result.skill.name)
        setStatus({
          kind: 'success',
          message: '已删除自定义覆盖，恢复为内置技能',
        })
      } else {
        const next =
          items.find((s) => s.source === 'custom') ||
          items.find((s) => s.source === 'builtin') ||
          null
        if (next) {
          await selectSkill(next.name)
        } else {
          handleNew()
        }
        setStatus({ kind: 'success', message: '自定义技能已删除' })
      }
    } catch (err) {
      setError(getErrorMessage(err, '删除技能失败'))
    } finally {
      setDeleting(false)
    }
  }

  return {
    skills,
    builtinSkills,
    customSkills,
    loadErrors,
    selectedKey,
    isNew,
    form,
    source,
    originalName,
    loading,
    detailLoading,
    saving,
    deleting,
    error,
    setError,
    status,
    canDelete,
    canSave,
    readOnly,
    updateField,
    selectSkill,
    handleNew,
    handleSave,
    handleDelete,
    reload: load,
  }
}
