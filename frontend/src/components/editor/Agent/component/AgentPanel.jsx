import {
  History,
  MessageCircleMore,
  MessageSquarePlus,
  PanelRightClose,
} from 'lucide-react'
import { useEffect } from 'react'
import { useAgentPanel } from '../hook/useAgentPanel'
import '../styles/AgentPanel.css'
import { ChatPanel } from './chatpanel/ChatPanel'
import { InputBar } from './inputbar/InputBar'
import { HistoryPanel } from './shell/HistoryPanel'

/**
 * 右侧 AI Agent 栏（SSE 生成 + 会话落盘）
 * 设计对照：d7ubn Sidebar/Agent；历史 UI 壳 OckRz
 */
export function AgentPanel({
  projectId,
  tempRules = '',
  chapterId,
  currentContent = '',
  selectedText = '',
  contentAnchor = null,
  onClearSelection,
  setAiDraft,
  onRegisterRetry,
  onCollapse,
  draft = null,
}) {
  const {
    panelMode,
    setPanelMode,
    sessions,
    activeSessionId,
    activeSession,
    sessionsLoading,
    messagesEndRef,
    input,
    setInput,
    notice,
    setNotice,
    showNotice,
    generating,
    sendDisabled,
    modelId,
    modelOpen,
    modelOptions,
    selectedModel,
    handleNewChat,
    handleSelectSession,
    handleSend,
    handleStop,
    handleRetry,
    handleQuickAction,
    attachmentItems,
    skillOptions,
    handleUploadFiles,
    handleRemoveAttachment,
    handleAddSkill,
    setModelOpen,
    setModelId,
  } = useAgentPanel({
    projectId,
    tempRules,
    chapterId,
    currentContent,
    selectedText,
    contentAnchor,
    draft,
    setAiDraft,
  })

  // 重试能力上提给编辑区草稿卡（气泡按钮已移除）
  useEffect(() => {
    onRegisterRetry?.(handleRetry)
  }, [handleRetry, onRegisterRetry])

  return (
    <aside className="agent-panel">
      <header className="agent-panel__head">
        <div className="agent-panel__head-left">
          <MessageCircleMore size={16} strokeWidth={2} aria-hidden />
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
            messages={activeSession?.messages || []}
            messagesEndRef={messagesEndRef}
            onQuickAction={handleQuickAction}
            generating={generating || sessionsLoading}
            sendDisabled={sendDisabled || sessionsLoading}
          />
          <InputBar
            notice={notice}
            onDismissNotice={() => setNotice('')}
            generating={generating || sessionsLoading}
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            onStop={handleStop}
            attachmentItems={attachmentItems}
            skillOptions={skillOptions}
            onUploadFiles={handleUploadFiles}
            onRemoveAttachment={handleRemoveAttachment}
            onAddSkill={handleAddSkill}
            selection={
              selectedText ? { text: selectedText, anchor: contentAnchor } : null
            }
            onClearSelection={onClearSelection}
            contextUsage={activeSession?.contextUsage}
            modelOptions={modelOptions}
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
