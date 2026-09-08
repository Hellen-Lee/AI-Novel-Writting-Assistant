import './ContextUsageRing.css'

/** 千位缩略：用于显示已用 token（保留 1 位小数） */
function fmtUsed(n) {
  const k = n / 1000
  return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`
}

/** 千位缩略：用于显示上下文窗口上限（按 1024 取整，贴合 32k/64k/128k 惯例） */
function fmtWin(n) {
  const k = n / 1024
  return `${Math.round(k)}k`
}

/**
 * 底栏「上下文 tokens 用量」静默圆环。
 * 无中央数字，hover 弹出 tooltip：如 "20% · 25.6k / 128k Tokens"。
 * used / window 缺失（未生成过 / 无精确值）时隐藏，不显示误导性 0%。
 */
export function ContextUsageRing({ used, window: win, loading = false }) {
  if (typeof used !== 'number' || !win) return null

  const pct = Math.min(100, (used / win) * 100)
  const frac = pct / 100

  const R = 8.5
  const C = 2 * Math.PI * R
  const tone = frac >= 0.8 ? 'danger' : frac >= 0.5 ? 'warn' : 'ok'

  return (
    <span className={`ctx-ring ctx-ring--${tone}${loading ? ' is-loading' : ''}`}>
      <svg
        className="ctx-ring__svg"
        width="22"
        height="22"
        viewBox="0 0 22 22"
        aria-hidden
      >
        <circle
          className="ctx-ring__track"
          cx="11"
          cy="11"
          r={R}
          fill="none"
          strokeWidth="2.5"
        />
        <circle
          className="ctx-ring__progress"
          cx="11"
          cy="11"
          r={R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 11 11)"
        />
      </svg>
      <span className="ctx-ring__tip" role="tooltip">
        {pct.toFixed(0)}% · {fmtUsed(used)} / {fmtWin(win)} Tokens
      </span>
    </span>
  )
}
