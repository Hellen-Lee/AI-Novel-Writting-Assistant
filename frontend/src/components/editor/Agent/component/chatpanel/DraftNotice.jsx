import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Markdown } from '../../../../ui/Markdown'
import { draftNoticeText } from '../../utils/phase'

/** 写作轮气泡的折叠提示（默认收起，可展开回看完整正文） */
export function DraftNotice({ phase, charCount = 0, pending = false, text }) {
  const [open, setOpen] = useState(false)
  const label = draftNoticeText({ phase, charCount, pending })
  return (
    <div className="agent-panel__draft-notice">
      <Sparkles size={13} className="agent-panel__draft-notice-icon" aria-hidden />
      <span className="agent-panel__draft-notice-text">{label}</span>
      {text ? (
        <button
          type="button"
          className="agent-panel__link-btn"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '收起' : '查看正文'}
        </button>
      ) : null}
      {open ? (
        <Markdown
          text={text}
          className="agent-panel__draft-notice-body"
          conservative
        />
      ) : null}
    </div>
  )
}
