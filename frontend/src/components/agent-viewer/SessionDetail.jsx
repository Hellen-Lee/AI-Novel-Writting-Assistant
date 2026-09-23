import { useEffect } from 'react'
import { TurnCard } from './TurnCard'
import { formatRunTime, NONE_SESSION_ID } from './format'
import './SessionDetail.css'

export function SessionDetail({
  projectId,
  session,
  sessionInfo,
  runs,
  selectedRunId,
  loading,
  error,
}) {
  useEffect(() => {
    if (!selectedRunId) return undefined
    const node = document.getElementById(`agent-turn-${selectedRunId}`)
    node?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    return undefined
  }, [selectedRunId, runs])

  if (loading) {
    return <div className="agent-viewer-detail__hint">加载会话详情…</div>
  }
  if (error) {
    return <p className="agent-viewer-detail__error">{error}</p>
  }
  if (!session) {
    return (
      <div className="agent-viewer-detail__hint">
        从左侧选择一个会话，查看每一轮「用户输入 + Agent 回复」，以及中间的
        Router / Skill / 摘要调用。
      </div>
    )
  }

  const title = sessionInfo?.title || session.title
  const summary = String(sessionInfo?.summary || '').trim()
  const model =
    runs.find((run) => run.model)?.model ||
    session.runs.find((run) => run.model)?.model ||
    ''

  return (
    <div className="agent-viewer-detail">
      <header className="agent-viewer-detail__head">
        <div className="agent-viewer-detail__ids">
          <h2>{title}</h2>
          <p>
            <span className="agent-viewer-detail__sid">
              {session.sessionId === NONE_SESSION_ID
                ? '无 session_id'
                : session.sessionId}
            </span>
            {' · '}
            {runs.length || session.runs.length} 轮
            {model ? ` · ${model}` : ''}
            {' · '}
            {formatRunTime(session.updatedAt)}
          </p>
        </div>
        {summary ? (
          <section className="agent-viewer-detail__summary">
            <h3>注入后续 Router / 闲聊的会话摘要</h3>
            <pre>{summary}</pre>
          </section>
        ) : null}
      </header>

      {runs.length === 0 ? (
        <div className="agent-viewer-detail__hint">该会话还没有生成记录。</div>
      ) : (
        <ol className="agent-viewer-detail__turns">
          {runs.map((run, index) => (
            <li key={run.run_id}>
              <TurnCard
                projectId={projectId}
                run={run}
                index={index}
                selected={run.run_id === selectedRunId}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
