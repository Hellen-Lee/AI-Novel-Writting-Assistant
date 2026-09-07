import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { normalizeToolArgs, toolArgSummary, toolLabel } from '../../../utils/phase'
import '../../../styles/ToolCall.css'

/** 波浪错峰步长（秒）：每行依次延迟，形成自上而下推进的波浪感 */
const WAVE_STEP = 0.16
/** 参与错峰的最大行数，超出后回到起始相位，避免延迟无限累加 */
const WAVE_SLOTS = 6

/**
 * 同一 name 的多次调用合并为一组：
 * - 按钮行只展示工具中文名，细节一律收进 args
 * - 默认收起，点击按钮切换；展开后每次调用的参数摘要逐行列在同一个 `agent-panel__toolcall-args` 里
 * - running（工具调用中）时工具名做颜色深浅交替的波浪动画，结束后恢复默认
 */
function ToolCallGroup({ name, calls, running = false, index = 0 }) {
  const [open, setOpen] = useState(false)
  const label = toolLabel(name)
  const summaries = useMemo(
    () =>
      calls
        .map((c) => toolArgSummary(c?.name, normalizeToolArgs(c?.arguments)))
        .filter(Boolean),
    [calls],
  )
  // 每行错峰：通过 CSS 变量下发相位，图标与文案共用同一节奏
  const waveStyle = running
    ? { '--wave-delay': `${(index % WAVE_SLOTS) * WAVE_STEP}s` }
    : undefined
  return (
    <li className="agent-panel__toolcall-item">
      <button
        type="button"
        className={`agent-panel__toolcall-row${running ? ' agent-panel__toolcall-row--running' : ''}`}
        style={waveStyle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Wrench size={12} className="agent-panel__toolcall-icon" aria-hidden />
        <span
          className={`agent-panel__toolcall-name${
            running ? ' agent-panel__toolcall-name--running' : ''
          }`}
        >
          {label}
        </span>
        <span className="agent-panel__toolcall-toggle">
          {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        </span>
      </button>
      {open && summaries.length ? (
        <ul className="agent-panel__toolcall-args">
          {summaries.map((s, i) => (
            <li key={i} className="agent-panel__toolcall-arg-item">
              {s}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** 工具调用组列表：按 name 合并同类项 */
export function ToolCallList({ tools = [], running = false }) {
  const groups = useMemo(() => {
    if (!Array.isArray(tools) || tools.length === 0) return []
    const order = []
    const map = new Map()
    for (const t of tools) {
      const name = t?.name ?? 'tool'
      if (!map.has(name)) {
        map.set(name, [])
        order.push(name)
      }
      map.get(name).push(t)
    }
    return order.map((name) => ({ name, calls: map.get(name) }))
  }, [tools])

  if (groups.length === 0) return null

  return (
    <ul className="agent-panel__toolcall-list">
      {groups.map((g, i) => (
        <ToolCallGroup
          key={g.name}
          name={g.name}
          calls={g.calls}
          running={running}
          index={i}
        />
      ))}
    </ul>
  )
}