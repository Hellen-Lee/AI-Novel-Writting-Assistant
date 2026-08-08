import '../../styles/ChatPanel.css'
import { MessageList } from './MessageList'

/** 消息区；无消息时展示空态引导与快捷指令 */
export function ChatPanel({
  messages,
  messagesEndRef,
  draft,
  onApplyDraft,
  onDiscardDraft,
  onRetry,
  onQuickAction,
  generating,
}) {
  return (
    <MessageList
      messages={messages}
      messagesEndRef={messagesEndRef}
      draft={draft}
      onApplyDraft={onApplyDraft}
      onDiscardDraft={onDiscardDraft}
      onRetry={onRetry}
      onQuickAction={onQuickAction}
      generating={generating}
    />
  )
}
