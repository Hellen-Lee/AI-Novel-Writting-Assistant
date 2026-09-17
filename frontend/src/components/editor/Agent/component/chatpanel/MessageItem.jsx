import { Markdown } from '../../../../ui/Markdown'
import { AGENT_PHASE } from '../../utils/constants'
import { isToolCalling } from '../../utils/phase'
import { AssistantPhase } from './AssistantPhase'
import { DraftNotice } from './DraftNotice'
import { ToolCallList } from './toolcall'
import { AttachmentBundle } from '../inputbar/workspace'

export function MessageItem({ message }) {
  if (message.role === 'user') {
    return (
      <div className="agent-panel__msg agent-panel__msg--user">
        <AttachmentBundle
          items={message.attachments || []}
          selection={message.selection || null}
        />
        <div className="agent-panel__bubble agent-panel__bubble--user">
          {message.content}
        </div>
      </div>
    )
  }

  const streaming = message.phase === AGENT_PHASE.STREAMING
  const collapsed = Boolean(message.draftRound)
  const hasBody = Boolean(message.content)
  const body = collapsed ? (
    <DraftNotice
      phase={message.phase}
      charCount={message.charCount}
      pending={message.pending}
      text={message.content}
    />
  ) : hasBody ? (
    <Markdown text={message.content} className="agent-panel__md" />
  ) : message.error ? (
    <p className="agent-panel__error-text">{message.error}</p>
  ) : null

  return (
    <div className="agent-panel__msg agent-panel__msg--ai">
      <div className="agent-panel__ai-meta">
        <span className="agent-panel__ai-name">Agent</span>
        {message.skill ? (
          <span className="agent-panel__ai-skill">· {message.skill}</span>
        ) : null}
      </div>
      <div className="agent-panel__bubble agent-panel__bubble--ai">
        <AssistantPhase phase={message.phase} />
        <ToolCallList tools={message.tools} running={isToolCalling(message.phase)} />
        {body}
        {streaming && !collapsed && hasBody ? (
          <i className="agent-panel__cursor" aria-hidden />
        ) : null}
      </div>
    </div>
  )
}
