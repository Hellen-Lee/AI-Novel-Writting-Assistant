import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { AppHeader } from './components/layout/AppHeader'
import { AppLayout } from './components/layout/AppLayout'
import { EditorLayout } from './components/layout/EditorLayout'
import { Button } from './components/ui/Button'
import HomePage from './pages/HomePage'
import OnboardingPage from './pages/OnboardingPage'
import EditorPage from './pages/EditorPage'
import MemoryPage from './pages/MemoryPage'
import SettingsPage from './pages/SettingsPage'

function HomeLayout() {
  return (
    <AppLayout
      header={
        <AppHeader
          actions={
            <>
              <Button to="/settings" variant="ghost" className="app-header__settings">
                <Settings size={14} strokeWidth={2} />
                设置
              </Button>
              <Button to="/projects/new" variant="primary">
                新建项目
              </Button>
            </>
          }
        />
      }
    />
  )
}

function SettingsLayout() {
  /** 设置页自带顶栏与侧栏，全屏自管布局 */
  return <Outlet />
}

function OnboardingLayout() {
  /** 引导页自带顶栏（返回 / 步骤 / 跳过），不再套全局品牌 Header */
  return <AppLayout />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<HomeLayout />}>
          <Route index element={<HomePage />} />
        </Route>

        <Route path="projects/new" element={<OnboardingLayout />}>
          <Route index element={<OnboardingPage />} />
        </Route>

        <Route path="projects/:projectId" element={<EditorLayout />}>
          <Route index element={<Navigate to="edit" replace />} />
          <Route path="edit" element={<EditorPage />} />
          <Route path="edit/:chapterId" element={<EditorPage />} />
          <Route path="memory" element={<MemoryPage />} />
        </Route>

        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<SettingsPage />} />
        </Route>

        <Route path="config" element={<Navigate to="/settings?tab=api" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
