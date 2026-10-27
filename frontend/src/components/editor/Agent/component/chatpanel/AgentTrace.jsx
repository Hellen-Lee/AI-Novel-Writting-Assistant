import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Wrench,
} from 'lucide-react'
import {
  hasThinkingPhase,
  normalizeToolArgs,
  toolArgSummary,
  toolLabel,
} from '../../utils/phase'

/** 工具名去重（保留首次出现顺序），用于一行汇总文案 */
function uniqueToolNames(tools = []) {
  const names = []
  for (const tool of tools) {
    const name = tool?.name
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * 过程容器：把「思考」与「工具调用」收进同一个折叠块。
 *
 * 二者本是同一段过程的前后片段，平级展示会让一屏出现多个同权重折叠行、
 * 多处并发动画（观感像整块在呼吸）。收进一个容器后：
 * - 收起态只有一行静态汇总，全屏仅顶部状态行一处动效；
 * - 展开态先给思考原文，再逐条列工具参数；
 * - 工具在 tool_progress 到达时已经执行完毕，因此这里不做「进行中」动画。
 */
export function AgentTrace({ messageId, phase, thinking = '', tools = [] }) {
  const active = hasThinkingPhase(phase)
  const [open, setOpen] = useState(active)
  const bodyRef = useRef(null)
  const wasActiveRef = useRef(active)
  const bodyId = `agent-trace-${messageId || 'message'}`

  // 生成中默认展开以展示实时思考，正文开流后自动收起
  useEffect(() => {
    if (!active && wasActiveRef.current) {
      setOpen(false)
    }
    wasActiveRef.current = active
  }, [active])

  useEffect(() => {
    if (!active || !open || !bodyRef.current) return
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [active, open, thinking])

  if (!thinking && tools.length === 0) return null

  const toolNames = uniqueToolNames(tools)
  const toolSummary = toolNames.map(toolLabel).join('、')
  const label = [thinking ? '已深度思考' : '', toolSummary]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="agent-panel__trace">
      <button
        type="button"
        className="agent-panel__trace-toggle"
        aria-controls={bodyId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="agent-panel__trace-label">
          {thinking ? (
            <Sparkles size={13} className="agent-panel__trace-icon" aria-hidden />
          ) : (
            <Wrench size={12} className="agent-panel__trace-icon" aria-hidden />
          )}
          <span className="agent-panel__trace-text">{label}</span>
        </span>
        <span className="agent-panel__trace-arrow">
          {open ? (
            <ChevronDown size={12} aria-hidden />
          ) : (
            <ChevronRight size={12} aria-hidden />
          )}
        </span>
      </button>
      {open ? (
        <div
          id={bodyId}
          ref={bodyRef}
          className="agent-panel__trace-body"
          role="region"
          aria-label="生成过程"
        >
          {thinking ? (
            <div className="agent-panel__trace-thinking">
              <pre>{thinking}</pre>
            </div>
          ) : null}
          {toolNames.length ? (
            <ul className="agent-panel__trace-tools">
              {tools.map((tool, index) => {
                const summary = toolArgSummary(
                  tool?.name,
                  normalizeToolArgs(tool?.arguments),
                )
                return (
                  <li key={`${tool?.name || 'tool'}-${index}`}>
                    <Wrench size={11} aria-hidden />
                    <span className="agent-panel__trace-tool-name">
                      {toolLabel(tool?.name)}
                    </span>
                    {summary ? (
                      <span className="agent-panel__trace-tool-args">{summary}</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
