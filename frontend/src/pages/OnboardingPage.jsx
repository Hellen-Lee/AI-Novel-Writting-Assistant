import { Button } from '../components/ui/Button'
import './PlaceholderPage.css'

/** 新建项目引导页骨架 — 设计对照：Review/Screen/Onboarding-Setup */
export default function OnboardingPage() {
  return (
    <div className="placeholder-page">
      <div className="placeholder-page__card">
        <p className="placeholder-page__eyebrow">新建项目</p>
        <h1>单页引导</h1>
        <p className="placeholder-page__desc">
          题材 & 世界观 · 故事内核 · 主要角色 · 全本大纲。完整交互将在 4.3 实现。
        </p>
        <div className="placeholder-page__actions">
          <Button to="/" variant="ghost">
            返回首页
          </Button>
          <Button to="/projects/demo/edit" variant="primary">
            跳过并进入编辑（占位）
          </Button>
        </div>
      </div>
    </div>
  )
}
