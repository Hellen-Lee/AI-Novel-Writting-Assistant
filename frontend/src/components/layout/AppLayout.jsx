import { Outlet } from 'react-router-dom'
import './AppLayout.css'

/** 首页 / 配置 / 引导页：顶栏 + 内容区 */
export function AppLayout({ header }) {
  return (
    <div className="app-layout">
      {header}
      <main className="app-layout__main">
        <Outlet />
      </main>
    </div>
  )
}
