import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { ChevronLeft, Settings } from 'lucide-react'
import { getErrorMessage } from '../../api/client'
import { getProject } from '../../api/projects'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EditorChromeProvider } from '../../stores/editorChrome'
import { useEditorChrome } from '../../stores/useEditorChrome'
import './EditorLayout.css'

const SAVE_LABEL = {
  saved: '已保存',
  dirty: '未保存',
  saving: '保存中…',
}

/**
 * 项目内布局：顶栏（返回 + 编辑/设定）+ 内容区
 * 设计对照：Explore/Editor-v3 (NMi2X)、Review/Screen/Editor-v2 (N0lDh)
 */
function EditorLayoutInner() {
  const { projectId } = useParams()
  const location = useLocation()
  const base = `/projects/${projectId}`
  const { saveStatus } = useEditorChrome()
  const [projectName, setProjectName] = useState('加载中…')
  const isEditRoute = location.pathname.includes('/edit')
  const showSaveBadge =
    isEditRoute || location.pathname.includes('/memory')

  useEffect(() => {
    let cancelled = false
    getProject(projectId)
      .then((detail) => {
        if (!cancelled) setProjectName(detail?.meta?.name || '未命名作品')
      })
      .catch((err) => {
        if (!cancelled) setProjectName(getErrorMessage(err, '项目'))
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <div className="editor-layout">
      <header className="editor-layout__header">
        <div className="editor-layout__nav-left">
          <NavLink to="/" className="editor-layout__back">
            <ChevronLeft size={16} strokeWidth={2} />
            <span className="editor-layout__project-name">{projectName}</span>
          </NavLink>
          {showSaveBadge ? (
            <Badge
              className={
                saveStatus === 'dirty'
                  ? 'editor-layout__save-badge editor-layout__save-badge--dirty'
                  : 'editor-layout__save-badge'
              }
            >
              {SAVE_LABEL[saveStatus] || SAVE_LABEL.saved}
            </Badge>
          ) : null}
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

        <div className="editor-layout__nav-right">
          <Button
            to="/settings?tab=api"
            variant="secondary"
            className="editor-layout__settings"
          >
            <Settings size={14} strokeWidth={2} />
            设置
          </Button>
        </div>
      </header>

      <div className="editor-layout__body">
        <Outlet />
      </div>
    </div>
  )
}

export function EditorLayout() {
  return (
    <EditorChromeProvider>
      <EditorLayoutInner />
    </EditorChromeProvider>
  )
}
