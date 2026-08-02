import { useEffect, useMemo, useState } from 'react'
import { HardDrive, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../api/client'
import { deleteProject, listProjects } from '../api/projects'
import { ProjectCard } from '../components/projects/ProjectCard'
import { formatTotalWordsShort } from '../utils/format'
import './HomePage.css'

const FILTER_ALL = '全部'

export default function HomePage() {
  const [projects, setProjects] = useState([])
  const [filter, setFilter] = useState(FILTER_ALL)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState('')

  const loadProjects = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listProjects()
      setProjects(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(getErrorMessage(err, '加载项目列表失败'))
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const genres = useMemo(() => {
    const set = new Set()
    for (const project of projects) {
      const genre = project.genre?.trim()
      if (genre) set.add(genre)
    }
    return [FILTER_ALL, ...Array.from(set)]
  }, [projects])

  useEffect(() => {
    if (!genres.includes(filter)) setFilter(FILTER_ALL)
  }, [genres, filter])

  const filtered = useMemo(() => {
    if (filter === FILTER_ALL) return projects
    return projects.filter((p) => (p.genre?.trim() || '') === filter)
  }, [projects, filter])

  const stats = useMemo(() => {
    const totalWords = projects.reduce(
      (sum, item) => sum + (Number(item.total_words) || 0),
      0,
    )
    return {
      count: projects.length,
      totalWords,
    }
  }, [projects])

  const handleDelete = async (project) => {
    const ok = window.confirm(
      `确定删除项目「${project.name}」？\n本地目录与章节将被移除，且不可恢复。`,
    )
    if (!ok) return

    setDeletingId(project.id)
    setError('')
    try {
      await deleteProject(project.id)
      setProjects((prev) => prev.filter((item) => item.id !== project.id))
    } catch (err) {
      setError(getErrorMessage(err, '删除项目失败'))
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="home-page">
      <section className="home-page__hero">
        <div className="home-page__hero-copy">
          <h1>继续你的故事</h1>
          <p>设定不崩 · 规则可约束 · 记忆本地保存。所有数据只在你的电脑上。</p>
        </div>
        <div className="home-page__stats">
          <div className="home-page__stat">
            <strong>{loading ? '—' : stats.count}</strong>
            <span>在写项目</span>
          </div>
          <div className="home-page__stat">
            <strong>{loading ? '—' : formatTotalWordsShort(stats.totalWords)}</strong>
            <span>总字数</span>
          </div>
          <div className="home-page__stat" title="记忆条目统计将在设定页打通后补充">
            <strong>—</strong>
            <span>记忆条目</span>
          </div>
        </div>
      </section>

      <section className="home-page__list">
        <div className="home-page__list-head">
          <h2>本地项目</h2>
          <div className="home-page__filters" role="tablist" aria-label="题材筛选">
            {genres.map((genre) => (
              <button
                key={genre}
                type="button"
                role="tab"
                aria-selected={filter === genre}
                className={`home-page__filter${filter === genre ? ' is-active' : ''}`}
                onClick={() => setFilter(genre)}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="home-page__error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={loadProjects}>
              重试
            </button>
          </div>
        )}

        {loading ? (
          <div className="home-page__state">正在加载本地项目…</div>
        ) : (
          <div className="home-page__grid">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={deletingId === project.id ? undefined : handleDelete}
              />
            ))}

            <Link to="/projects/new" className="home-page__new-card">
              <Plus size={28} strokeWidth={1.75} />
              <span className="home-page__new-title">新建项目</span>
              <span className="home-page__new-hint">单页引导 · AI 一键生成</span>
            </Link>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="home-page__empty-hint">
            {filter === FILTER_ALL
              ? '还没有项目，点击「新建项目」开始创作。'
              : `当前没有「${filter}」题材的项目。`}
          </p>
        )}
      </section>

      <aside className="home-page__tip">
        <HardDrive size={18} aria-hidden />
        <p>
          数据保存在项目目录 <code>data/projects/</code> — 无需账号，可自行备份或迁移项目目录。
        </p>
      </aside>
    </div>
  )
}
