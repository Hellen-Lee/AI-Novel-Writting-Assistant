import {
  Bot,
  FilePen,
  History,
  MessageSquarePlus,
} from 'lucide-react'
import { useAgentPanel } from '../hook/useAgentPanel'
import '../styles/AgentPanel.css'
import { ChatPanel } from './chatpanel/ChatPanel'
import { InputBar } from './inputbar/InputBar'
import { HistoryPanel } from './shell/HistoryPanel'
import { QuickActions } from './shell/QuickActions'
import { RulesPanel } from './shell/RulesPanel'

/**
 * 右侧 AI Agent 栏（仅界面；生成走后续链路）
 * 设计对照：NMi2X Sidebar/Agent、C88ki / Ts9tL Overlay/TempRules
 */
export function AgentPanel({
  projectId,
  onApplyDraft,
  onDiscardDraft,
  draft = null,
}) {
  const {
    panelMode,
    setPanelMode,
    sessions,
    activeSessionId,
    activeSession,
    messagesEndRef,
    rulesId,
    tempRules,
    rulesDraft,
    setRulesDraft,
    globalRules,
    stylePreference,
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
    openRules,
    handleRulesBack,
    handleRulesClear,
    handleRulesSave,
    setModelOpen,
    setModelId,
  } = useAgentPanel({ projectId })

  return (
    <aside className="agent-panel">
      <header className="agent-panel__head">
        <div className="agent-panel__head-left">
          <Bot size={16} strokeWidth={2} aria-hidden />
          <h2>AI 对话</h2>
          {tempRules.trim() ? (
            <span className="agent-panel__rules-badge" title="已设置临时规则">
              规则
            </span>
          ) : null}
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
            className={`agent-panel__icon-btn${panelMode === 'rules' ? ' is-active' : ''}`}
            aria-label="临时规则"
            title="临时规则"
            onClick={() => {
              if (panelMode === 'rules') {
                handleRulesBack()
              } else {
                openRules()
              }
            }}
          >
            <FilePen size={15} />
          </button>
        </div>
      </header>

      {panelMode === 'history' ? (
        <HistoryPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          onClose={() => setPanelMode('chat')}
          onSelectSession={handleSelectSession}
        />
      ) : panelMode === 'rules' ? (
        <RulesPanel
          rulesId={rulesId}
          globalRules={globalRules}
          stylePreference={stylePreference}
          rulesDraft={rulesDraft}
          onRulesDraftChange={setRulesDraft}
          onBack={handleRulesBack}
          onClear={handleRulesClear}
          onSave={handleRulesSave}
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
