import { Plus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import './HomePage.css'

/** 首页 / 项目列表骨架 — 设计对照：Review/Screen/Projects */
export default function HomePage() {
  return (
    <div className="home-page">
      <section className="home-page__hero">
        <div className="home-page__hero-copy">
          <h1>继续你的故事</h1>
          <p>本地项目一览 · 设定与章节都保存在本机</p>
        </div>
        <div className="home-page__stats" aria-hidden>
          <div className="home-page__stat">
            <strong>—</strong>
            <span>运行中项目</span>
          </div>
          <div className="home-page__stat">
            <strong>—</strong>
            <span>总字数</span>
          </div>
          <div className="home-page__stat">
            <strong>—</strong>
            <span>AI 生成点</span>
          </div>
        </div>
      </section>

      <section className="home-page__list">
        <div className="home-page__list-head">
          <h2>本地项目</h2>
        </div>
        <div className="home-page__grid">
          <Button to="/projects/new" variant="secondary" className="home-page__new-card">
            <Plus size={28} strokeWidth={1.5} />
            <span>新增项目</span>
          </Button>
        </div>
      </section>

      <aside className="home-page__tip">
        项目数据保存在本地 data/ 目录，无需云端账号。后续在此接入项目列表接口。
      </aside>
    </div>
  )
}
