import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { AGENT_PHASE } from '../../utils/constants'

/**
 * 原生 reasoning 的折叠展示。
 * 生成阶段自动展开并跟随增量滚动，正文开始或生成结束后自动收起；
 * 用户在结束后手动展开时不再被后续渲染重置。
 */
export function ThinkingBlock({ messageId, phase, text }) {
  const active = phase === AGENT_PHASE.THINKING
  const [open, setOpen] = useState(active)
  const bodyRef = useRef(null)
  const wasActiveRef = useRef(active)
  const bodyId = `agent-thinking-${messageId || 'message'}`

  useEffect(() => {
    if (!active && wasActiveRef.current) {
      setOpen(false)
    }
    wasActiveRef.current = active
  }, [active])

  useEffect(() => {
    if (!active || !open || !bodyRef.current) return
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [active, open, text])

  if (!text) return null

  return (
    <section className="agent-panel__thinking">
      <button
        type="button"
        className="agent-panel__thinking-toggle"
        aria-controls={bodyId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="agent-panel__thinking-label">
          <Sparkles size={13} aria-hidden />
          <span>已深度思考</span>
        </span>
        {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      </button>
      {open ? (
        <div
          id={bodyId}
          ref={bodyRef}
          className="agent-panel__thinking-body"
          role="region"
          aria-label="思考过程"
        >
          <pre>{text}</pre>
        </div>
      ) : null}
    </section>
  )
}
