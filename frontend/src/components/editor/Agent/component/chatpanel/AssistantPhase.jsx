import { LoaderCircle } from 'lucide-react'
import { AGENT_PHASE } from '../../utils/constants'

/**
 * 生成阶段状态行（只渲染状态，不渲染正文）。
 * 工具调用不再在此展示：改为逐行 ToolCallList，见 ./toolcall。
 */
export function AssistantPhase({ phase }) {
  if (phase === AGENT_PHASE.THINKING) {
    return (
      <div className="agent-panel__phase">
        <LoaderCircle size={12} className="agent-panel__phase-spin" aria-hidden />
        <span>正在思考</span>
        <i className="agent-panel__dots" aria-hidden />
      </div>
    )
  }
  if (phase === AGENT_PHASE.STOPPED) {
    return (
      <div className="agent-panel__phase agent-panel__phase--stopped">
        已终止
      </div>
    )
  }
  return null
}
