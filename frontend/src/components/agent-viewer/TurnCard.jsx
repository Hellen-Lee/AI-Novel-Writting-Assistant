import { ModelCall } from './ModelCall'
import { formatMs, formatPct, formatRunTime } from './format'
import {
  assembledPromptBlocks,
  pipelineNodes,
  remainingFromSteps,
  routeLabel,
  splitPipeline,
  turnLatency,
} from './pipeline'
import './TurnCard.css'

export function TurnCard({ run, index, selected }) {
  const { exec } = splitPipeline(run?.steps)
  const nodes = pipelineNodes(run)
  const remaining = remainingFromSteps(run?.steps)
  const truncated = (run?.steps || []).some((step) => step?.budget_report?.truncated)
  const failed = Boolean(exec?.error || exec?.aborted)
  const agentText = exec?.response || ''
  const promptBlocks = assembledPromptBlocks(run)

  return (
    <article
      id={`agent-turn-${run.run_id}`}
      className={`agent-viewer-turn${selected ? ' is-selected' : ''}`}
    >
      <header className="agent-viewer-turn__head">
        <span className="agent-viewer-turn__round">第 {index + 1} 轮</span>
        <span className="agent-viewer-turn__route">{routeLabel(run)}</span>
        <span className="agent-viewer-turn__facts">
          {formatRunTime(run.created_at)}
          {' · '}
          {formatMs(turnLatency(run))}
          {' · 剩余 '}
          {formatPct(remaining)}
          {truncated ? ' · 截断' : ''}
          {failed ? ' · 失败' : ''}
        </span>
      </header>

      <div className="agent-viewer-turn__dialog">
        <section className="agent-viewer-turn__role">
          <h3>用户</h3>
          {promptBlocks.map((block) => (
            <div
              key={block.key}
              className={`agent-viewer-turn__block${block.key === 'user-input' ? ' is-plain' : ''}`}
            >
              <span className="agent-viewer-turn__prefix">{block.prefix}</span>
              <pre>{block.text || '（空）'}</pre>
            </div>
          ))}
        </section>
        <section className="agent-viewer-turn__role agent-viewer-turn__role--agent">
          <h3>Agent</h3>
          <pre>{agentText || (failed ? '（生成失败或已中断）' : '（空回复）')}</pre>
        </section>
      </div>

      <div className="agent-viewer-turn__flow">
        <div className="agent-viewer-turn__flow-head">
          <span>本轮模型调用</span>
          <PipelineStrip nodes={nodes} />
        </div>
        <ol className="agent-viewer-turn__calls">
          {(run.steps || []).map((step, stepIndex) => (
            <ModelCall
              key={`${step.mode || 'call'}-${stepIndex}`}
              step={step}
              index={stepIndex}
            />
          ))}
        </ol>
      </div>
    </article>
  )
}

function PipelineStrip({ nodes }) {
  if (!nodes.length) {
    return <span className="agent-viewer-turn__pipeline-empty">无调用记录</span>
  }
  return (
    <span className="agent-viewer-turn__pipeline">
      {nodes.map((node, index) => (
        <span key={node.id} className="agent-viewer-turn__pipe-node">
          {index > 0 ? (
            <span className="agent-viewer-turn__arrow" aria-hidden="true">
              →
            </span>
          ) : null}
          <span className={`agent-viewer-chip agent-viewer-chip--${node.mode}`}>
            {node.label}
          </span>
        </span>
      ))}
    </span>
  )
}
