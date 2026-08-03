import { useEffect, useState } from 'react'
import { getErrorMessage } from '../../api/client'
import { getConfig, listModels, saveConfig, testConfig } from '../../api/config'
import {
  EMPTY_API_FORM,
  configToForm,
  toProbePayload,
  toSavePayload,
} from './constants'

export function useApiSettings(enabled) {
  const [form, setForm] = useState(EMPTY_API_FORM)
  const [savedSnapshot, setSavedSnapshot] = useState(EMPTY_API_FORM)
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState({ kind: 'idle', message: '' })
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getConfig()
      const next = configToForm(data)
      setForm(next)
      setSavedSnapshot(next)
      setApiKeyConfigured(Boolean(data?.api_key_configured))
      setStatus({ kind: 'idle', message: '' })
      setModels([])
    } catch (err) {
      setError(getErrorMessage(err, '加载配置失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!enabled) return undefined
    load()
    return undefined
  }, [enabled])

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setStatus((prev) => (prev.kind === 'success' ? { kind: 'idle', message: '' } : prev))
  }

  const handleTest = async () => {
    setTesting(true)
    setError('')
    setStatus({ kind: 'idle', message: '' })
    try {
      const probe = toProbePayload(form)
      const result = await testConfig(probe)
      const modelIds = Array.isArray(result?.models) ? result.models : []

      let nextModels = modelIds
      if (nextModels.length === 0) {
        try {
          const listed = await listModels(probe)
          nextModels = (listed?.models || []).map((m) => m.id).filter(Boolean)
        } catch {
          nextModels = []
        }
      }
      setModels(nextModels)

      if (nextModels.length > 0) {
        setForm((prev) =>
          nextModels.includes(prev.model)
            ? prev
            : { ...prev, model: nextModels[0] },
        )
      }

      setStatus({
        kind: 'success',
        message:
          nextModels.length > 0 ? '连接成功，可选择模型' : '连接成功',
      })
    } catch (err) {
      setStatus({
        kind: 'error',
        message: getErrorMessage(err, '连接测试失败'),
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await saveConfig(toSavePayload(form))
      const next = configToForm(data)
      setForm(next)
      setSavedSnapshot(next)
      setApiKeyConfigured(Boolean(data?.api_key_configured))
      setStatus({ kind: 'success', message: '配置已保存' })
    } catch (err) {
      setError(getErrorMessage(err, '保存配置失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setForm(savedSnapshot)
    setError('')
    setStatus({ kind: 'idle', message: '' })
  }

  const dirty =
    form.api_base !== savedSnapshot.api_base ||
    form.api_key !== savedSnapshot.api_key ||
    form.model !== savedSnapshot.model ||
    Number(form.context_window) !== Number(savedSnapshot.context_window)

  return {
    form,
    models,
    loading,
    testing,
    saving,
    error,
    setError,
    status,
    apiKeyConfigured,
    dirty,
    updateField,
    handleTest,
    handleSave,
    handleReset,
    reload: load,
  }
}
