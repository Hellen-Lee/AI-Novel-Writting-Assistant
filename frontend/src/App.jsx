import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppHeader } from './components/layout/AppHeader'
import { AppLayout } from './components/layout/AppLayout'
import { EditorLayout } from './components/layout/EditorLayout'
import { Button } from './components/ui/Button'
import HomePage from './pages/HomePage'
import OnboardingPage from './pages/OnboardingPage'
import EditorPage from './pages/EditorPage'
import MemoryPage from './pages/MemoryPage'
import ConfigPage from './pages/ConfigPage'

function HomeLayout() {
  return (
    <AppLayout
      header={
        <AppHeader
          actions={
            <>
              <Button to="/config" variant="ghost">
                模型配置
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

function ConfigLayout() {
  return (
    <AppLayout
      header={
        <AppHeader
          actions={
            <Button to="/" variant="ghost">
              返回首页
            </Button>
          }
        />
      }
    />
  )
}

function OnboardingLayout() {
  return (
    <AppLayout
      header={
        <AppHeader
          actions={
            <Button to="/" variant="ghost">
              取消
            </Button>
          }
        />
      }
    />
  )
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

        <Route path="config" element={<ConfigLayout />}>
          <Route index element={<ConfigPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
