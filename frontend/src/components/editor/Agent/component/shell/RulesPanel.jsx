import { ChevronLeft } from 'lucide-react'
import '../../styles/RulesPanel.css'
import { displayReadonly } from '../../utils/display'

export function RulesPanel({
  rulesId,
  globalRules,
  stylePreference,
  rulesDraft,
  onRulesDraftChange,
  onBack,
  onClear,
  onSave,
}) {
  return (
    <div className="agent-panel__overlay--rules">
      <div className="agent-panel__rules-head">
        <button
          type="button"
          className="agent-panel__rules-back"
          onClick={onBack}
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden />
          AI 对话
        </button>
      </div>

      <div className="agent-panel__rules-body">
        <section className="agent-panel__rules-section">
          <h3 className="agent-panel__rules-sec-title">全局规则</h3>
          <div className="agent-panel__rules-readonly">
            {displayReadonly(globalRules)}
          </div>
        </section>

        <section className="agent-panel__rules-section">
          <h3 className="agent-panel__rules-sec-title">文风偏好</h3>
          <div className="agent-panel__rules-readonly">
            {displayReadonly(stylePreference)}
          </div>
        </section>

        <section className="agent-panel__rules-section agent-panel__rules-section--temp">
          <label
            className="agent-panel__rules-sec-title agent-panel__rules-sec-title--emph"
            htmlFor={rulesId}
          >
            临时规则
          </label>
          <textarea
            id={rulesId}
            className="agent-panel__rules-input"
            value={rulesDraft}
            onChange={(e) => onRulesDraftChange(e.target.value)}
            placeholder="例如：本章侧重压迫感；暂不揭示身份；对话短促……"
          />
        </section>
      </div>

      <div className="agent-panel__rules-footer">
        <button
          type="button"
          className="agent-panel__rules-btn agent-panel__rules-btn--clear"
          onClick={onClear}
        >
          清空临时规则
        </button>
        <button
          type="button"
          className="agent-panel__rules-btn agent-panel__rules-btn--save"
          onClick={onSave}
        >
          保存
        </button>
      </div>
    </div>
  )
}
