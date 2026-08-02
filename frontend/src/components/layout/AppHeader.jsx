import { Link } from 'react-router-dom'
import { Feather } from 'lucide-react'
import './AppHeader.css'

/**
 * 全局顶栏（首页 / 模型配置等）
 * 设计对照：Review/Screen/Projects Header
 */
export function AppHeader({ actions }) {
  return (
    <header className="app-header">
      <Link to="/" className="app-header__brand">
        <span className="app-header__logo" aria-hidden>
          <Feather size={18} strokeWidth={2} />
        </span>
        <span className="app-header__brand-text">
          <span className="app-header__name">墨叙</span>
          <span className="app-header__sub">本地 AI 小说创作 Agent</span>
        </span>
      </Link>
      <div className="app-header__actions">{actions}</div>
    </header>
  )
}
