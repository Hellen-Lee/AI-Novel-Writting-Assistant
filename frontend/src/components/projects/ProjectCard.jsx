import { BookOpen, FileText, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '../ui/Badge'
import { formatRelativeTime, formatWordCount } from '../../utils/format'
import './ProjectCard.css'

export function ProjectCard({ project, onDelete }) {
  const genre = project.genre?.trim() || '未分类'
  const synopsis = project.description?.trim() || '暂无简介，进入编辑页开始创作。'

  const handleDelete = (event) => {
    event.preventDefault()
    event.stopPropagation()
    onDelete?.(project)
  }

  return (
    <Link to={`/projects/${project.id}/edit`} className="project-card">
      <div className="project-card__head">
        <Badge>{genre}</Badge>
        <div className="project-card__head-right">
          <time dateTime={project.updated_at}>
            {formatRelativeTime(project.updated_at)}
          </time>
          {onDelete && (
            <button
              type="button"
              className="project-card__delete"
              aria-label={`删除项目 ${project.name}`}
              title="删除项目"
              onClick={handleDelete}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <h3 className="project-card__title">{project.name || '未命名项目'}</h3>
      <p className="project-card__synopsis">{synopsis}</p>

      <div className="project-card__meta">
        <span>
          <FileText size={14} aria-hidden />
          {formatWordCount(project.total_words)}
        </span>
        <span>
          <BookOpen size={14} aria-hidden />
          {project.chapter_count ?? 0} 章
        </span>
      </div>
    </Link>
  )
}
