import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  API_TIPS,
  CONTEXT_WINDOW_OPTIONS,
  PROVIDERS_TEXT,
} from './constants'
import { SettingsSelect } from './SettingsSelect'
import { useApiSettings } from './useApiSettings'

function HelpAside() {
  return (
    <aside className="settings-help">
      <section className="settings-help__card">
        <h2>使用提示</h2>
        <ul className="settings-help__tips">
          {API_TIPS.map((tip) => (
            <li key={tip}>
              <Check size={14} strokeWidth={2.5} aria-hidden />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="settings-help__providers">
        <h3>兼容提供商</h3>
        <p>{PROVIDERS_TEXT}</p>
      </section>
    </aside>
  )
}

function StatusDot({ status }) {
  if (status.kind === 'idle' || !status.message) return null
  return (
    <div
      className={`settings-api__status settings-api__status--${status.kind}`}
      role="status"
    >
      <span className="settings-api__dot" aria-hidden />
      <span>{status.message}</span>
    </div>
  )
}

export function ApiSettingsPanel() {
  const {
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
    reload,
  } = useApiSettings(true)

  const modelOptions = useMemo(
    () => models.map((id) => ({ value: id, label: id })),
    [models],
  )

  if (loading) {
    return (
      <div className="settings-page__content settings-page__content--loading">
        <p>加载配置中…</p>
      </div>
    )
  }

  return (
    <div className="settings-page__content">
      <section className="settings-card settings-api">
        <header className="settings-api__head">
          <h1>大模型 API</h1>
          <p>支持 OpenAI 兼容接口：GPT / Claude / DeepSeek / 通义 / 文心等。</p>
        </header>

        {error ? (
          <div className="settings-api__banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}>
              关闭
            </button>
            <button type="button" onClick={reload}>
              重试
            </button>
          </div>
        ) : null}

        <label className="settings-field">
          <span className="settings-field__label">API Base URL</span>
          <input
            className="settings-field__input settings-field__input--mono"
            type="url"
            name="api_base"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://api.openai.com/v1"
            value={form.api_base}
            onChange={(e) => updateField('api_base', e.target.value)}
          />
        </label>

        <label className="settings-field">
          <span className="settings-field__label">API Key</span>
          <input
            className="settings-field__input settings-field__input--mono"
            type="password"
            name="api_key"
            autoComplete="off"
            placeholder={
              apiKeyConfigured ? '已配置，修改后将覆盖原密钥' : 'sk-…'
            }
            value={form.api_key}
            onChange={(e) => updateField('api_key', e.target.value)}
          />
        </label>

        <div className="settings-field">
          <span className="settings-field__label" id="settings-model-label">
            默认模型
          </span>
          <SettingsSelect
            aria-labelledby="settings-model-label"
            value={form.model}
            options={modelOptions}
            placeholder={
              modelOptions.length > 0
                ? '请选择模型'
                : '连接成功后可选择模型'
            }
            mono
            emptyHint="请先点击「测试连接」，成功后再从列表选择模型"
            onChange={(v) => updateField('model', v)}
          />
          <span className="settings-field__hint">
            需先「测试连接」成功，再从 API 拉取可用模型列表
          </span>
        </div>

        <div className="settings-params">
          <h3>生成参数</h3>
          <div className="settings-field settings-field--compact">
            <span
              className="settings-field__label settings-field__label--muted"
              id="settings-context-label"
            >
              单次会话最大上下文
            </span>
            <SettingsSelect
              aria-labelledby="settings-context-label"
              value={form.context_window}
              options={CONTEXT_WINDOW_OPTIONS}
              onChange={(v) => updateField('context_window', Number(v))}
            />
          </div>
        </div>

        <footer className="settings-api__actions">
          <StatusDot status={status} />
          <div className="settings-api__btns">
            {dirty ? (
              <Button
                variant="ghost"
                type="button"
                onClick={handleReset}
                disabled={saving || testing}
              >
                重置
              </Button>
            ) : null}
            <Button
              variant="secondary"
              type="button"
              onClick={handleTest}
              disabled={testing || saving || !form.api_base.trim()}
            >
              {testing ? '测试中…' : '测试连接'}
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={handleSave}
              disabled={saving || testing}
            >
              {saving ? '保存中…' : '保存配置'}
            </Button>
          </div>
        </footer>
      </section>

      <HelpAside />
    </div>
  )
}
