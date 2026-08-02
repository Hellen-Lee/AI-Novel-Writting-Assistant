import { Check, ChevronDown } from 'lucide-react'
import { MODEL_OPTIONS } from '../../utils/constants'

export function ModelPicker({
  selectedModel,
  modelOpen,
  modelId,
  onToggleModel,
  onSelectModel,
}) {
  return (
    <div className="agent-panel__model-wrap">
      <button
        type="button"
        className={`agent-panel__model-btn${modelOpen ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={modelOpen}
        onClick={onToggleModel}
      >
        <span>{selectedModel.name}</span>
        <ChevronDown size={12} />
      </button>
      {modelOpen ? (
        <ul
          className="agent-panel__model-menu"
          role="listbox"
          aria-label="选择模型"
        >
          {MODEL_OPTIONS.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === modelId}
                className={`agent-panel__model-item${m.id === modelId ? ' is-active' : ''}`}
                onClick={() => onSelectModel(m.id)}
              >
                <span className="agent-panel__model-item-left">
                  <span className="agent-panel__model-item-name">{m.name}</span>
                  <span className="agent-panel__model-item-desc">{m.desc}</span>
                </span>
                {m.id === modelId ? <Check size={14} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
