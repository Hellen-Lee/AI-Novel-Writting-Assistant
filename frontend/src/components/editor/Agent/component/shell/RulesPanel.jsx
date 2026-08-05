import { SlidersHorizontal, X } from 'lucide-react'
import '../../styles/RulesPanel.css'
import { displayReadonly } from '../../utils/display'

/**
 * 独立「创作规则」侧栏（非 Agent 内遮罩）
 * 设计对照：RvfPH Sidebar/Rules (wUVY0)
 */
export function RulesPanel({
  rulesId,
  globalRules,
  stylePreference,
  rulesDraft,
  onRulesDraftChange,
  onClose,
  onClear,
  onSave,
}) {
  return (
    <aside className="rules-panel">
      <header className="rules-panel__head">
        <div className="rules-panel__head-left">
          <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
          <h2>创作规则</h2>
        </div>
        <button
          type="button"
          className="rules-panel__icon-btn"
          aria-label="关闭"
          title="关闭"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>

      <div className="rules-panel__body">
        <section className="rules-panel__section">
          <h3 className="rules-panel__sec-title">全局规则</h3>
          <div className="rules-panel__readonly">
            {displayReadonly(globalRules)}
          </div>
        </section>

        <section className="rules-panel__section">
          <h3 className="rules-panel__sec-title">文风偏好</h3>
          <div className="rules-panel__readonly">
            {displayReadonly(stylePreference)}
          </div>
        </section>

        <section className="rules-panel__section rules-panel__section--temp">
          <label
            className="rules-panel__sec-title rules-panel__sec-title--emph"
            htmlFor={rulesId}
          >
            临时规则
          </label>
          <textarea
            id={rulesId}
            className="rules-panel__input"
            value={rulesDraft}
            onChange={(e) => onRulesDraftChange(e.target.value)}
            placeholder="例如：本章侧重压迫感；暂不揭示身份；对话短促……"
          />
        </section>
      </div>

      <div className="rules-panel__footer">
        <button
          type="button"
          className="rules-panel__btn rules-panel__btn--clear"
          onClick={onClear}
        >
          清空临时规则
        </button>
        <button
          type="button"
          className="rules-panel__btn rules-panel__btn--save"
          onClick={onSave}
        >
          保存
        </button>
      </div>
    </aside>
  )
}
