import '../../styles/ChatPanel.css'
import { MessageList } from './MessageList'

/** 仅消息区；底栏由 AgentPanel 组装 QuickActions + InputBar */
export function ChatPanel({
  messages,
  messagesEndRef,
  draft,
  onApplyDraft,
  onDiscardDraft,
  onRetry,
}) {
  return (
    <MessageList
      messages={messages}
      messagesEndRef={messagesEndRef}
      draft={draft}
      onApplyDraft={onApplyDraft}
      onDiscardDraft={onDiscardDraft}
      onRetry={onRetry}
    />
  )
}
