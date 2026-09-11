import { AgentPanel } from './Agent'
import { RulesPanel } from './Agent/component/shell/RulesPanel'
import { useResizablePanel } from './useResizablePanel'
import { RailResizeHandle } from './RailResizeHandle'
import './EditorRightRail.css'

/**
 * 编辑页右侧栏编排：Agent 对话 | 创作规则
 * Agent 保持挂载（hidden），避免切到规则侧栏时丢失会话态
 * 设计对照：d7ubn Sidebar/Agent、RvfPH Sidebar/Rules
 */
export function EditorRightRail({
  open,
  mode,
  projectId,
  tempRules,
  chapterId,
  currentContent,
  selectedText,
  contentAnchor = null,
  onClearSelection,
  setAiDraft,
  draft,
  onRegisterRetry,
  onCollapse,
  rulesId,
  globalRules,
  stylePreference,
  rulesDraft,
  onRulesDraftChange,
  onRulesClear,
  onRulesSave,
  onRulesClose,
}) {
  const { width, isDragging, onHandlePointerDown } = useResizablePanel({
    storageKey: 'editor.agentRailWidth',
    defaultWidth: 320,
    min: 300,
    max: 600,
  })

  return (
    <div
      className={`editor-right-rail${!open ? ' is-collapsed' : ''}`}
      aria-hidden={!open}
      style={{ width: `${width}px`, '--agent-width': `${width}px` }}
    >
      <RailResizeHandle
        isDragging={isDragging}
        onPointerDown={onHandlePointerDown}
      />
      {mode === 'rules' ? (
        <RulesPanel
          rulesId={rulesId}
          globalRules={globalRules}
          stylePreference={stylePreference}
          rulesDraft={rulesDraft}
          onRulesDraftChange={onRulesDraftChange}
          onClose={onRulesClose}
          onClear={onRulesClear}
          onSave={onRulesSave}
        />
      ) : null}
      <div
        className="editor-right-rail__agent-slot"
        hidden={mode !== 'agent'}
        aria-hidden={mode !== 'agent'}
      >
        <AgentPanel
          projectId={projectId}
          tempRules={tempRules}
          chapterId={chapterId}
          currentContent={currentContent}
          selectedText={selectedText}
          contentAnchor={contentAnchor}
          onClearSelection={onClearSelection}
          setAiDraft={setAiDraft}
          draft={draft}
          onRegisterRetry={onRegisterRetry}
          onCollapse={onCollapse}
        />
      </div>
    </div>
  )
}
