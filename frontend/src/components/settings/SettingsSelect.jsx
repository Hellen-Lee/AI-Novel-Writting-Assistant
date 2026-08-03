import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/**
 * 设置页自定义下拉 — 对照设计：默认模型 / 单次会话最大上下文
 * options: [{ value, label, description? }]
 */
export function SettingsSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  mono = false,
  emptyHint = '',
  disabled = false,
  'aria-labelledby': ariaLabelledBy,
}) {
  const listId = useId()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)

  const selected = options.find((o) => String(o.value) === String(value))
  // 仅展示选项列表中的选中项；未命中时一律用提示符，不回退显示裸 value
  const display = selected?.label || placeholder
  const isPlaceholder = !selected

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (next) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div
      className={`settings-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={`settings-select__trigger${mono ? ' settings-select__trigger--mono' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`settings-select__value${isPlaceholder ? ' is-placeholder' : ''}`}
        >
          {display}
        </span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden />
      </button>

      {open ? (
        <ul
          id={listId}
          className="settings-select__menu"
          role="listbox"
          aria-labelledby={ariaLabelledBy}
        >
          {options.length === 0 ? (
            <li className="settings-select__empty">{emptyHint || '暂无选项'}</li>
          ) : (
            options.map((opt) => {
              const active = String(opt.value) === String(value)
              return (
                <li key={String(opt.value)}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`settings-select__option${active ? ' is-active' : ''}`}
                    onClick={() => pick(opt.value)}
                  >
                    <span className="settings-select__option-text">
                      <span
                        className={`settings-select__option-label${mono ? ' is-mono' : ''}`}
                      >
                        {opt.label}
                      </span>
                      {opt.description ? (
                        <span className="settings-select__option-desc">
                          {opt.description}
                        </span>
                      ) : null}
                    </span>
                    {active ? <Check size={14} strokeWidth={2.5} aria-hidden /> : null}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}
