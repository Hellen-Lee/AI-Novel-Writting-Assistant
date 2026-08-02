import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import './Modal.css'

/**
 * 居中模态窗壳：遮罩 + 对话框。
 * 设计对照：Onboarding-Modal-* Overlay
 */
export function Modal({
  open,
  title,
  onClose,
  headerActions,
  children,
  footer,
  width = 520,
  className = '',
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-root" role="presentation">
      <button
        type="button"
        className="modal-root__mask"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className={`modal-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : '对话框'}
        style={{ width }}
      >
        <header className="modal-dialog__header">
          <h2 className="modal-dialog__title">{title}</h2>
          <div className="modal-dialog__header-actions">
            {headerActions}
            <button
              type="button"
              className="modal-dialog__icon-btn"
              aria-label="关闭"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="modal-dialog__body">{children}</div>
        {footer ? <footer className="modal-dialog__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
