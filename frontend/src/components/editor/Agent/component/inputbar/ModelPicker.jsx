import { Check, ChevronDown, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function ModelPicker({
  options = [],
  selectedModel,
  modelOpen,
  modelId,
  onToggleModel,
  onSelectModel,
}) {
  const navigate = useNavigate()
  const isEmpty = options.length === 0

  const openSettings = (e) => {
    e.stopPropagation()
    navigate('/settings?tab=api')
  }

  return (
    <div className="agent-panel__model-wrap">
      <button
        type="button"
        className={`agent-panel__model-btn${modelOpen ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={modelOpen}
        onClick={onToggleModel}
      >
        <span>{isEmpty ? '默认模型' : selectedModel?.name || '选择模型'}</span>
        <ChevronDown size={12} />
      </button>
      {modelOpen ? (
        <ul
          className={`agent-panel__model-menu${isEmpty ? ' agent-panel__model-menu--empty' : ''}`}
          role="listbox"
          aria-label="选择模型"
        >
          {!isEmpty ? (
            options.map((m) => (
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
                    {m.desc ? (
                      <span className="agent-panel__model-item-desc">{m.desc}</span>
                    ) : null}
                  </span>
                  {m.id === modelId ? <Check size={14} /> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="agent-panel__model-empty-wrap">
              <span className="agent-panel__model-empty-text">暂无模型接入</span>
              <button
                type="button"
                className="agent-panel__model-add-btn"
                onClick={openSettings}
              >
                <Plus size={14} strokeWidth={2.5} aria-hidden />
                添加模型
              </button>
            </li>
          )}
        </ul>
      ) : null}
    </div>
  )
}
