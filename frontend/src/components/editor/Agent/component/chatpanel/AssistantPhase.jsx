import { LoaderCircle } from 'lucide-react'
import { AGENT_PHASE } from '../../utils/constants'

/**
 * 生成阶段状态行（只渲染状态，不渲染正文）。
 * 过程细节（思考原文、工具调用）收在 ./AgentTrace 容器里；
 * 这里是全屏唯一的「进行中」动效，因此也承担工具调用阶段的提示。
 */
export function AssistantPhase({ phase }) {
  if (phase === AGENT_PHASE.THINKING || phase === AGENT_PHASE.TOOL_CALL) {
    return (
      <div className="agent-panel__phase">
        <LoaderCircle size={12} className="agent-panel__phase-spin" aria-hidden />
        <span>
          {phase === AGENT_PHASE.TOOL_CALL ? '正在调用工具' : '正在思考'}
        </span>
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
