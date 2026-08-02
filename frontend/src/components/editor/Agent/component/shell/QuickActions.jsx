import '../../styles/QuickActions.css'
import { QUICK_ACTIONS } from '../../utils/constants'

export function QuickActions({ selectedSkill, onQuickAction, generating }) {
  return (
    <div className="agent-panel__qa" role="group" aria-label="快捷指令">
      {QUICK_ACTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`agent-panel__qa-btn${selectedSkill === id ? ' is-active' : ''}`}
          onClick={() => onQuickAction(id, label)}
          disabled={generating}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  )
}
