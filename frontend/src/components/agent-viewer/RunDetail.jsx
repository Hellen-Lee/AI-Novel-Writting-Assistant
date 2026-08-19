import { CallStep } from './CallStep'
import { formatMs, formatPct, formatRunTime } from './format'
import './RunDetail.css'

export function RunDetail({ run, loading, error }) {
  if (loading) {
    return <div className="agent-viewer-detail__hint">加载 run 详情…</div>
  }
  if (error) {
    return <p className="agent-viewer-detail__error">{error}</p>
  }
  if (!run) {
    return (
      <div className="agent-viewer-detail__hint">
        从左侧选择一条 run，查看每次模型调用的 skill / 工具 / prompt。
      </div>
    )
  }

  const steps = Array.isArray(run.steps) ? run.steps : []
  const truncated = steps.some((step) => step?.budget_report?.truncated)
  const latency = steps.reduce((sum, step) => sum + (Number(step?.latency_ms) || 0), 0)
  const remaining = remainingFromSteps(steps)

  return (
    <div className="agent-viewer-detail">
      <header className="agent-viewer-detail__head">
        <div className="agent-viewer-detail__ids">
          <h2>{run.run_id}</h2>
          <p>
            session {run.session_id || '—'} · {run.model || '未记录模型'} ·{' '}
            {formatRunTime(run.created_at)}
          </p>
        </div>
        <dl className="agent-viewer-detail__stats">
          <div>
            <dt>总耗时</dt>
            <dd>{formatMs(latency)}</dd>
          </div>
          <div>
            <dt>调用次数</dt>
            <dd>{steps.length}</dd>
          </div>
          <div>
            <dt>剩余上下文</dt>
            <dd>{formatPct(remaining)}</dd>
          </div>
          <div>
            <dt>截断</dt>
            <dd>{truncated ? '是' : '否'}</dd>
          </div>
        </dl>
        {run.user_input ? (
          <p className="agent-viewer-detail__input">{run.user_input}</p>
        ) : null}
      </header>

      <ol className="agent-viewer-detail__steps">
        {steps.map((step, index) => (
          <li key={`${step.mode || 'step'}-${index}`}>
            <CallStep step={step} index={index} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function remainingFromSteps(steps) {
  let execPct = null
  let lastPct = null
  for (const step of steps) {
    const pct = step?.budget_report?.remaining_pct
    if (pct == null) continue
    lastPct = pct
    if (step.mode === 'skill' || step.mode === 'chat') execPct = pct
  }
  return execPct ?? lastPct
}
