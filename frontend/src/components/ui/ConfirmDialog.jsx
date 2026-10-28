import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'
import { Modal } from './Modal'
import './ConfirmDialog.css'

/**
 * 通用二次确认框（删除类操作用）。
 * 依赖 Modal 的遮罩/ESC/滚动锁与 Button 变体，避免各面板重复拼装。
 */
export function ConfirmDialog({
  open,
  title = '确认操作',
  message,
  hint = '',
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? undefined : onCancel}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '处理中…' : confirmText}
          </Button>
        </>
      }
    >
      <div className="confirm-dialog__body">
        {danger ? (
          <span className="confirm-dialog__icon" aria-hidden>
            <AlertTriangle size={18} />
          </span>
        ) : null}
        <div className="confirm-dialog__text">
          <p className="confirm-dialog__message">{message}</p>
          {hint ? <p className="confirm-dialog__hint">{hint}</p> : null}
        </div>
      </div>
    </Modal>
  )
}
