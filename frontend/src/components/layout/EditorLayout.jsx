import { NavLink, Outlet, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import './EditorLayout.css'

/**
 * 项目内布局：顶栏（返回 + 编辑/设定）+ 内容区
 * 设计对照：Explore/Editor-v3、Review/Screen/设定库
 */
export function EditorLayout() {
  const { projectId } = useParams()
  const base = `/projects/${projectId}`

  return (
    <div className="editor-layout">
      <header className="editor-layout__header">
        <div className="editor-layout__nav-left">
          <NavLink to="/" className="editor-layout__back">
            <ChevronLeft size={16} strokeWidth={2} />
            <span className="editor-layout__project-name">返回项目列表</span>
          </NavLink>
        </div>

        <nav className="editor-layout__tabs" aria-label="项目视图">
          <NavLink
            to={`${base}/edit`}
            className={({ isActive }) =>
              `editor-layout__tab${isActive ? ' is-active' : ''}`
            }
          >
            编辑
          </NavLink>
          <NavLink
            to={`${base}/memory`}
            className={({ isActive }) =>
              `editor-layout__tab${isActive ? ' is-active' : ''}`
            }
          >
            设定
          </NavLink>
        </nav>

        <div className="editor-layout__nav-right" />
      </header>

      <div className="editor-layout__body">
        <Outlet />
      </div>
    </div>
  )
}
