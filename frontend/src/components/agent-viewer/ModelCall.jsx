import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import {
  formatMs,
  formatPct,
  MODE_LABEL,
  SOURCE_LABEL,
  toolNames,
} from './format'
import { callSummary } from './pipeline'
import './ModelCall.css'

export function ModelCall({ step, index }) {
  const [open, setOpen] = useState(false)
  const mode = step?.mode || 'unknown'
  const background = mode === 'summary'
  const tools = toolNames(step?.tools)
  const candidates = Array.isArray(step?.candidate_skills)
    ? step.candidate_skills
    : []
  const source = SOURCE_LABEL[step?.skill_source] || ''
  const remaining = step?.budget_report?.remaining_pct

  return (
    <li
      className={`agent-viewer-call${open ? ' is-open' : ''}${background ? ' is-background' : ''}`}
    >
      <button
        type="button"
        className="agent-viewer-call__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="agent-viewer-call__index">{index + 1}</span>
        <span className={`agent-viewer-chip agent-viewer-chip--${mode}`}>
          {MODE_LABEL[mode] || mode}
        </span>
        <span className="agent-viewer-call__summary">{callSummary(step)}</span>
        {step?.error ? (
          <span className="agent-viewer-chip agent-viewer-chip--warn">失败</span>
        ) : null}
        {step?.aborted ? (
          <span className="agent-viewer-chip agent-viewer-chip--warn">已中断</span>
        ) : null}
        <span className="agent-viewer-call__meta">
          {formatMs(step?.latency_ms)}
          {remaining != null ? ` · 剩余 ${formatPct(remaining)}` : ''}
        </span>
      </button>

      {open ? (
        <div className="agent-viewer-call__body">
          {mode === 'router' ? (
            <p className="agent-viewer-call__note">
              决策 {step.decision || '—'}
              {step.reason ? ` · ${step.reason}` : ''}
              {source ? ` · ${source}` : ''}
            </p>
          ) : null}
          {mode === 'skill' && source ? (
            <p className="agent-viewer-call__note">来源：{source}</p>
          ) : null}
          {mode === 'skill' || mode === 'chat' ? (
            <p className="agent-viewer-call__note">
              此步 response 即上方 Agent 回复（用户可见）。
            </p>
          ) : null}
          {mode === 'summary' ? (
            <p className="agent-viewer-call__note">
              后台压缩旧对话，写入 session.summary，不进入聊天气泡。
            </p>
          ) : null}
          {candidates.length ? (
            <p className="agent-viewer-call__note">
              候选 skill：{candidates.join('、')}
            </p>
          ) : null}
          {tools.length ? (
            <p className="agent-viewer-call__note">
              工具：{tools.join('、')}
            </p>
          ) : null}
          <TextPane label="system" text={step?.system || ''} />
          <TextPane label="user" text={step?.user || ''} />
          <TextPane
            label={
              mode === 'skill' || mode === 'chat'
                ? 'response（Agent 回复）'
                : 'response'
            }
            text={step?.response || ''}
          />
          <BudgetPane step={step} />
        </div>
      ) : null}
    </li>
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
        <dt>剩余上下文</dt>
        <dd>{formatPct(report.remaining_pct)}</dd>
      </div>
      <div>
        <dt>截断</dt>
        <dd>
          {report.truncated
            ? `是${cuts.length ? ` · ${cuts.join('、')}` : ''}`
            : '否'}
        </dd>
      </div>
      <div>
        <dt>字符</dt>
        <dd>
          system {chars.system ?? 0} · user {chars.user ?? 0} · response{' '}
          {chars.response ?? 0}
        </dd>
      </div>
    </dl>
  )
}
