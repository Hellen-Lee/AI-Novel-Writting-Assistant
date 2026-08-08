import '../../styles/QuickActions.css'
import { QUICK_ACTIONS } from '../../utils/constants'

export function QuickActions({ onQuickAction, generating }) {
  return (
    <div className="agent-panel__qa" role="group" aria-label="快捷指令">
      {QUICK_ACTIONS.map(({ id, label, desc, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="agent-panel__qa-btn"
          onClick={() => onQuickAction(id, label)}
          disabled={generating}
        >
          <span className="agent-panel__qa-icon">
            <Icon size={14} />
          </span>
          <span className="agent-panel__qa-texts">
            <span className="agent-panel__qa-label">{label}</span>
            <span className="agent-panel__qa-desc">{desc}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
