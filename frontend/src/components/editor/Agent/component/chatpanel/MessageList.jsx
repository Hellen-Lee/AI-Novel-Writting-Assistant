import { MessageSquare } from 'lucide-react'
import { QuickActions } from '../shell/QuickActions'
import { MessageItem } from './MessageItem'

function EmptyGuide({ onQuickAction, generating }) {
  return (
    <div className="agent-panel__empty">
      <div className="agent-panel__empty-prompt">
        <span className="agent-panel__empty-icon" aria-hidden>
          <MessageSquare size={20} />
        </span>
        <p className="agent-panel__empty-title">开始新对话</p>
        <p className="agent-panel__empty-hint">
          点选快捷指令，或输入 <code>/续写</code> 等技能名
        </p>
      </div>
      <QuickActions onQuickAction={onQuickAction} generating={generating} />
    </div>
  )
}

export function MessageList({
  messages,
  messagesEndRef,
  onQuickAction,
  generating,
}) {
  return (
    <div className="agent-panel__messages">
      {messages.length === 0 ? (
        <EmptyGuide onQuickAction={onQuickAction} generating={generating} />
      ) : (
        messages.map((msg) => <MessageItem key={msg.id} message={msg} />)
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}
