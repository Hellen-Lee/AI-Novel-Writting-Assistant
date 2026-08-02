import { MessageItem } from './MessageItem'

export function MessageList({
  messages,
  messagesEndRef,
  draft,
  onApplyDraft,
  onDiscardDraft,
  onRetry,
}) {
  return (
    <div className="agent-panel__messages">
      {messages.length === 0 ? (
        <p className="agent-panel__empty">
          使用底栏快捷指令，或输入 <code>/continue</code> 等 skill
          名。生成链路接入前，结果区仅作界面预览。
        </p>
      ) : (
        messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            draft={draft}
            onApplyDraft={onApplyDraft}
            onDiscardDraft={onDiscardDraft}
            onRetry={onRetry}
          />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}
