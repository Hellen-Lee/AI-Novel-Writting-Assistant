import { formatMs, formatPct, formatRunTime, MODE_LABEL } from './format'
import './RunList.css'

export function RunList({ runs, selectedId, onSelect }) {
  if (!runs.length) {
    return (
      <div className="agent-viewer-list__empty">
        此项目还没有 run。在编辑页生成一次后再刷新。
      </div>
    )
  }

  return (
    <ul className="agent-viewer-list">
      {runs.map((run) => {
        const active = run.run_id === selectedId
        const skills = run.skill_names?.length ? run.skill_names.join('、') : '无 skill'
        const tools = run.tools?.length ? `${run.tools.length} 工具` : '无工具'
        return (
          <li key={run.run_id}>
            <button
              type="button"
              className={`agent-viewer-list__item${active ? ' is-active' : ''}`}
              onClick={() => onSelect(run.run_id)}
            >
              <span className="agent-viewer-list__time">
                {formatRunTime(run.created_at)}
              </span>
              <span className="agent-viewer-list__input">
                {run.user_input || '（无输入预览）'}
              </span>
              <span className="agent-viewer-list__meta">
                {(run.modes || []).map((mode) => (
                  <span key={mode} className={`agent-viewer-chip agent-viewer-chip--${mode}`}>
                    {MODE_LABEL[mode] || mode}
                  </span>
                ))}
                <span className="agent-viewer-list__skill">{skills}</span>
              </span>
              <span className="agent-viewer-list__stats">
                <span>{tools}</span>
                <span>剩余 {formatPct(run.remaining_pct)}</span>
                <span>{formatMs(run.latency_ms_total)}</span>
                {run.truncated ? (
                  <span className="agent-viewer-chip agent-viewer-chip--warn">截断</span>
                ) : null}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
