import '../../styles/ChatPanel.css'
import { MessageList } from './MessageList'

/** 消息区；无消息时展示空态引导与快捷指令 */
export function ChatPanel({
  messages,
  messagesEndRef,
  onQuickAction,
  generating,
}) {
  return (
    <MessageList
      messages={messages}
      messagesEndRef={messagesEndRef}
      onQuickAction={onQuickAction}
      generating={generating}
    />
  )
}
