import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { formatMs, formatPct, MODE_LABEL, SOURCE_LABEL, toolNames } from './format'
import './CallStep.css'

const TABS = [
  { id: 'prompt', label: 'Prompt' },
  { id: 'response', label: '回复' },
  { id: 'budget', label: '预算' },
]

export function CallStep({ step, index }) {
  const [tab, setTab] = useState('prompt')
  const mode = step?.mode || 'unknown'
  const skillsLabel = step?.skill_name
    ? `${step.skill_name}${step.skill_kind ? ` · ${step.skill_kind}` : ''}`
    : ''
  const source = SOURCE_LABEL[step?.skill_source] || ''
  const tools = toolNames(step?.tools)
  const candidates = Array.isArray(step?.candidate_skills) ? step.candidate_skills : []

  return (
    <article className="agent-viewer-step">
      <header className="agent-viewer-step__head">
        <span className="agent-viewer-step__index">#{index + 1}</span>
        <span className={`agent-viewer-chip agent-viewer-chip--${mode}`}>
          {MODE_LABEL[mode] || mode}
        </span>
        {skillsLabel ? (
          <span className="agent-viewer-chip">{skillsLabel}</span>
        ) : null}
        {source ? (
          <span className="agent-viewer-chip agent-viewer-chip--muted">来源 {source}</span>
        ) : null}
        {tools.length ? (
          tools.map((name) => (
            <span key={name} className="agent-viewer-chip agent-viewer-chip--tool">
              {name}
            </span>
          ))
        ) : (
          <span className="agent-viewer-chip agent-viewer-chip--muted">无工具</span>
        )}
        {step?.error ? (
          <span className="agent-viewer-chip agent-viewer-chip--warn">失败</span>
        ) : null}
        {step?.aborted ? (
          <span className="agent-viewer-chip agent-viewer-chip--warn">已中断</span>
        ) : null}
        {step?.fallback ? (
          <span className="agent-viewer-chip agent-viewer-chip--muted">摘要兜底</span>
        ) : null}
        <span className="agent-viewer-step__latency">{formatMs(step?.latency_ms)}</span>
      </header>

      {mode === 'router' ? (
        <p className="agent-viewer-step__reason">
          决策 {step.decision || '—'}
          {step.reason ? ` · ${step.reason}` : ''}
        </p>
      ) : null}

      {candidates.length ? (
        <p className="agent-viewer-step__candidates">
          候选 skill：{candidates.join('、')}
        </p>
      ) : null}

      <div className="agent-viewer-step__tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`agent-viewer-step__tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'prompt' ? <PromptPane step={step} /> : null}
      {tab === 'response' ? (
        <TextPane label="response" text={step?.response || ''} />
      ) : null}
      {tab === 'budget' ? <BudgetPane step={step} /> : null}
    </article>
  )
}

function PromptPane({ step }) {
  return (
    <div className="agent-viewer-step__prompt">
      <TextPane label="system" text={step?.system || ''} />
      <TextPane label="user" text={step?.user || ''} />
    </div>
  )
}

function TextPane({ label, text }) {
  const [copied, setCopied] = useState(false)
  const body = text || '（空）'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text || '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="agent-viewer-pane">
      <div className="agent-viewer-pane__bar">
        <span>{label}</span>
        <button type="button" className="agent-viewer-pane__copy" onClick={copy}>
          {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="agent-viewer-pane__pre">{body}</pre>
    </section>
  )
}

function BudgetPane({ step }) {
  const report = step?.budget_report || {}
  const chars = step?.chars_est || {}
  const cuts = Array.isArray(report.cuts) ? report.cuts : []
  return (
    <dl className="agent-viewer-budget">
      <div>
        <dt>used / limit</dt>
        <dd>
          {report.used_est ?? '—'} / {report.limit ?? '—'}
          {report.estimate ? `（${report.estimate}）` : ''}
        </dd>
      </div>
      <div>
        <dt>剩余</dt>
        <dd>{formatPct(report.remaining_pct)}</dd>
      </div>
      <div>
        <dt>截断</dt>
        <dd>{report.truncated ? `是${cuts.length ? ` · ${cuts.join('、')}` : ''}` : '否'}</dd>
      </div>
      <div>
        <dt>字符</dt>
        <dd>
          system {chars.system ?? 0} · user {chars.user ?? 0} · response {chars.response ?? 0}
        </dd>
      </div>
    </dl>
  )
}
