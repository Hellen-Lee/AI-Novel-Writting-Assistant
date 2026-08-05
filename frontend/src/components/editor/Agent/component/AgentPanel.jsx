import {
  Bot,
  History,
  MessageSquarePlus,
  PanelRightClose,
} from 'lucide-react'
import { useAgentPanel } from '../hook/useAgentPanel'
import '../styles/AgentPanel.css'
import { ChatPanel } from './chatpanel/ChatPanel'
import { InputBar } from './inputbar/InputBar'
import { HistoryPanel } from './shell/HistoryPanel'
import { QuickActions } from './shell/QuickActions'

/**
 * 右侧 AI Agent 栏（仅界面；生成走后续链路）
 * 设计对照：d7ubn Sidebar/Agent；历史 UI 壳 OckRz
 */
export function AgentPanel({
  projectId,
  tempRules = '',
  onApplyDraft,
  onDiscardDraft,
  onCollapse,
  draft = null,
}) {
  const {
    panelMode,
    setPanelMode,
    sessions,
    activeSessionId,
    activeSession,
    messagesEndRef,
    selectedSkill,
    input,
    setInput,
    notice,
    setNotice,
    showNotice,
    generating,
    modelId,
    modelOpen,
    selectedModel,
    handleNewChat,
    handleSelectSession,
    handleSend,
    handleStop,
    handleRetry,
    handleQuickAction,
    setModelOpen,
    setModelId,
  } = useAgentPanel({ projectId, tempRules })

  return (
    <aside className="agent-panel">
      <header className="agent-panel__head">
        <div className="agent-panel__head-left">
          <Bot size={16} strokeWidth={2} aria-hidden />
          <h2>AI 对话</h2>
        </div>
        <div className="agent-panel__head-actions">
          <button
            type="button"
            className={`agent-panel__icon-btn${panelMode === 'history' ? ' is-active' : ''}`}
            aria-label="历史会话"
            title="历史会话"
            onClick={() =>
              setPanelMode((m) => (m === 'history' ? 'chat' : 'history'))
            }
          >
            <History size={15} />
          </button>
          <button
            type="button"
            className="agent-panel__icon-btn"
            aria-label="新建对话"
            title="新建对话"
            onClick={handleNewChat}
          >
            <MessageSquarePlus size={15} />
          </button>
          <button
            type="button"
            className="agent-panel__icon-btn"
            aria-label="收起侧栏"
            title="收起"
            onClick={onCollapse}
          >
            <PanelRightClose size={15} />
          </button>
        </div>
      </header>

      {panelMode === 'history' ? (
        <HistoryPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          onClose={() => setPanelMode('chat')}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onCollapse={onCollapse}
          onShowNotice={showNotice}
        />
      ) : (
        <>
          <ChatPanel
            messages={activeSession.messages}
            messagesEndRef={messagesEndRef}
            draft={draft}
            onApplyDraft={onApplyDraft}
            onDiscardDraft={onDiscardDraft}
            onRetry={handleRetry}
          />
          <InputBar
            notice={notice}
            onDismissNotice={() => setNotice('')}
            actions={
              <QuickActions
                selectedSkill={selectedSkill}
                onQuickAction={handleQuickAction}
                generating={generating}
              />
            }
            generating={generating}
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            onStop={handleStop}
            onShowAttachNotice={() => showNotice('附加能力待后续版本接入。')}
            selectedModel={selectedModel}
            modelOpen={modelOpen}
            modelId={modelId}
            onToggleModel={() => setModelOpen((o) => !o)}
            onSelectModel={(id) => {
              setModelId(id)
              setModelOpen(false)
            }}
          />
        </>
      )}
    </aside>
  )
}
