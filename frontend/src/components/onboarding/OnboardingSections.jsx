import {
  CircleCheck,
  Expand,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { volumeLabelFromIndex } from '../../utils/onboarding'

const GENRE_PRESETS = ['玄幻', '仙侠', '都市', '科幻', '悬疑']

export function GenreWorldviewSection({
  title,
  onTitleChange,
  genre,
  customGenreOpen,
  customGenre,
  onSelectGenre,
  onOpenCustomGenre,
  onCustomGenreChange,
  onConfirmCustomGenre,
  onCloseCustomGenre,
  worldview,
  onWorldviewChange,
  onOpenWorldviewModal,
  onAiGenerate,
}) {
  return (
    <section className="onboarding-section">
      <div className="onboarding-section__head">
        <h2>题材 & 世界观</h2>
        <button
          type="button"
          className="onboarding-page__btn-ai onboarding-page__btn-ai--sm"
          onClick={onAiGenerate}
        >
          <Sparkles size={12} />
          AI 生成
        </button>
      </div>

      <div className="onboarding-field">
        <label className="onboarding-field__label" htmlFor="ob-title">
          作品暂定名
        </label>
        <input
          id="ob-title"
          className="onboarding-input"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="例如：星渊剑主"
        />
      </div>

      <div className="onboarding-field">
        <span className="onboarding-field__label">题材分类</span>
        <div className="onboarding-genres">
          {GENRE_PRESETS.map((item) => (
            <button
              key={item}
              type="button"
              className={`onboarding-chip ${genre === item ? 'onboarding-chip--active' : ''}`}
              onClick={() => onSelectGenre(item)}
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            className="onboarding-chip onboarding-chip--other"
            onClick={onOpenCustomGenre}
          >
            <Plus size={12} />
            其他
          </button>
          {customGenreOpen ? (
            <div className="onboarding-chip-input">
              <input
                value={customGenre}
                onChange={(e) => onCustomGenreChange(e.target.value)}
                placeholder="填写新分类…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onConfirmCustomGenre()
                }}
                autoFocus
              />
              <button type="button" aria-label="确认" onClick={onConfirmCustomGenre}>
                <CircleCheck size={14} />
              </button>
              <button
                type="button"
                aria-label="取消"
                onClick={onCloseCustomGenre}
              >
                <X size={11} />
              </button>
            </div>
          ) : null}
          {genre && !GENRE_PRESETS.includes(genre) && !customGenreOpen ? (
            <span className="onboarding-chip onboarding-chip--active">{genre}</span>
          ) : null}
        </div>
      </div>

      <div className="onboarding-field onboarding-field--grow">
        <div className="onboarding-field__label-row">
          <label className="onboarding-field__label" htmlFor="ob-world">
            世界观简述
          </label>
          <button
            type="button"
            className="onboarding-field__hint-btn"
            onClick={onOpenWorldviewModal}
          >
            <Expand size={12} />
            点击展开编辑
          </button>
        </div>
        <textarea
          id="ob-world"
          className="onboarding-textarea onboarding-textarea--world"
          value={worldview}
          onChange={(e) => onWorldviewChange(e.target.value)}
          placeholder="描述世界背景、时代、力量体系、地理格局等…"
        />
      </div>
    </section>
  )
}

export function StoryCoreSection({ core, onCoreChange, onAiGenerate }) {
  return (
    <section className="onboarding-section">
      <div className="onboarding-section__head">
        <h2>故事内核</h2>
        <button
          type="button"
          className="onboarding-page__btn-ai onboarding-page__btn-ai--sm"
          onClick={onAiGenerate}
        >
          <Sparkles size={12} />
          AI 生成
        </button>
      </div>
      <div className="onboarding-field">
        <label className="onboarding-field__label" htmlFor="ob-theme">
          核心主题
        </label>
        <input
          id="ob-theme"
          className="onboarding-input"
          value={core.theme}
          onChange={(e) => onCoreChange({ theme: e.target.value })}
          placeholder="例如：成长与代价"
        />
      </div>
      <div className="onboarding-field">
        <label className="onboarding-field__label" htmlFor="ob-conflict">
          核心冲突
        </label>
        <textarea
          id="ob-conflict"
          className="onboarding-textarea onboarding-textarea--core"
          value={core.conflict}
          onChange={(e) => onCoreChange({ conflict: e.target.value })}
          placeholder="例如：剑冢秘密 vs 宗门规矩"
        />
      </div>
      <div className="onboarding-field">
        <label className="onboarding-field__label" htmlFor="ob-plotline">
          故事主线
        </label>
        <textarea
          id="ob-plotline"
          className="onboarding-textarea onboarding-textarea--core"
          value={core.plotline}
          onChange={(e) => onCoreChange({ plotline: e.target.value })}
          placeholder="例如：从边陲小城到九域之巅"
        />
      </div>
    </section>
  )
}

export function CharactersSection({
  characters,
  onEditCharacter,
  onRemoveCharacter,
  onAddCharacter,
  onAiGenerate,
}) {
  return (
    <section className="onboarding-section">
      <div className="onboarding-section__head">
        <h2>主要角色</h2>
        <button
          type="button"
          className="onboarding-page__btn-ai onboarding-page__btn-ai--sm"
          onClick={onAiGenerate}
        >
          <Sparkles size={12} />
          AI 生成
        </button>
      </div>
      <div className="onboarding-scroller">
        {characters.map((c) => (
          <article key={c.id} className="onboarding-card">
            <div className="onboarding-card__top">
              <div className="onboarding-card__name-row">
                <span className="onboarding-card__name">{c.name}</span>
                {c.role ? <span className="onboarding-card__tag">{c.role}</span> : null}
              </div>
              <div className="onboarding-card__actions">
                <button
                  type="button"
                  className="onboarding-card__icon-btn"
                  aria-label="展开编辑"
                  onClick={() => onEditCharacter(c)}
                >
                  <Expand size={15} />
                </button>
                <button
                  type="button"
                  className="onboarding-card__icon-btn onboarding-card__icon-btn--danger"
                  aria-label="删除角色"
                  onClick={() => onRemoveCharacter(c.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <span className="onboarding-card__desc-label">人物简介</span>
            <div className="onboarding-card__desc">
              {c.profile || '暂无简介'}
            </div>
          </article>
        ))}
        <button
          type="button"
          className="onboarding-card onboarding-card--add"
          onClick={onAddCharacter}
        >
          <span className="onboarding-card__add-icon">
            <Plus size={18} />
          </span>
          <span>添加</span>
        </button>
      </div>
    </section>
  )
}

export function OutlineSection({
  synopsis,
  onSynopsisChange,
  volumes,
  onOpenBriefModal,
  onEditVolume,
  onRemoveVolume,
  onAddVolume,
  onAiGenerate,
}) {
  return (
    <section className="onboarding-section">
      <div className="onboarding-section__head">
        <h2>全本大纲</h2>
        <button
          type="button"
          className="onboarding-page__btn-ai onboarding-page__btn-ai--sm"
          onClick={onAiGenerate}
        >
          <Sparkles size={12} />
          AI 生成
        </button>
      </div>
      <div className="onboarding-outline">
        <div className="onboarding-brief">
          <div className="onboarding-brief__top">
            <strong>全书概要</strong>
            <button
              type="button"
              className="onboarding-card__icon-btn"
              aria-label="展开编辑概要"
              onClick={onOpenBriefModal}
            >
              <Expand size={15} />
            </button>
          </div>
          <textarea
            className="onboarding-brief__text"
            value={synopsis}
            onChange={(e) => onSynopsisChange(e.target.value)}
            placeholder="一句话概括全书主线…"
          />
        </div>
        <div className="onboarding-scroller">
          {volumes.map((v, index) => (
            <article key={v.id} className="onboarding-card onboarding-card--volume">
              <div className="onboarding-card__top">
                <div className="onboarding-card__name-row">
                  <span className="onboarding-card__tag">
                    {v.label || volumeLabelFromIndex(index)}
                  </span>
                  <span className="onboarding-card__name">{v.name}</span>
                </div>
                <div className="onboarding-card__actions">
                  <button
                    type="button"
                    className="onboarding-card__icon-btn"
                    aria-label="展开编辑"
                    onClick={() => onEditVolume(v, index)}
                  >
                    <Expand size={15} />
                  </button>
                  <button
                    type="button"
                    className="onboarding-card__icon-btn onboarding-card__icon-btn--danger"
                    aria-label="删除卷"
                    onClick={() => onRemoveVolume(v.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="onboarding-card__desc">{v.summary || '暂无梗概'}</div>
            </article>
          ))}
          <button
            type="button"
            className="onboarding-card onboarding-card--add"
            onClick={onAddVolume}
          >
            <span className="onboarding-card__add-icon">
              <Plus size={18} />
            </span>
            <span>添加</span>
          </button>
        </div>
      </div>
    </section>
  )
}

export { GENRE_PRESETS }
