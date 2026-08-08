import { useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { SettingsSelect } from './SettingsSelect'
import { SKILL_KIND_OPTIONS, skillIcon } from './skillConstants'
import { useSkillSettings } from './useSkillSettings'
import './SkillSettingsPanel.css'

function autoResizeTextarea(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function SkillListItem({ skill, active, onSelect }) {
  const Icon = skillIcon(skill.name)
  return (
    <button
      type="button"
      className={`settings-skill__item${active ? ' is-active' : ''}`}
      onClick={() => onSelect(skill.name)}
    >
      <span className="settings-skill__item-icon" aria-hidden>
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="settings-skill__item-text">
        <span className="settings-skill__item-title">{skill.name}</span>
        <span className="settings-skill__item-desc">{skill.description}</span>
      </span>
    </button>
  )
}

function SkillList({
  builtinSkills,
  customSkills,
  selectedKey,
  isNew,
  onSelect,
  onNew,
}) {
  return (
    <aside className="settings-skill__list">
      <div className="settings-skill__list-scroll">
        <h2 className="settings-skill__list-heading">全部技能</h2>

        <p className="settings-skill__group-label">内置</p>
        <div className="settings-skill__group">
          {builtinSkills.length === 0 ? (
            <p className="settings-skill__empty">暂无内置技能</p>
          ) : (
            builtinSkills.map((skill) => (
              <SkillListItem
                key={skill.name}
                skill={skill}
                active={!isNew && selectedKey === skill.name}
                onSelect={onSelect}
              />
            ))
          )}
        </div>

        <p className="settings-skill__group-label">自定义</p>
        <div className="settings-skill__group">
          {customSkills.length === 0 ? (
            <p className="settings-skill__empty">尚未创建自定义技能</p>
          ) : (
            customSkills.map((skill) => (
              <SkillListItem
                key={skill.name}
                skill={skill}
                active={!isNew && selectedKey === skill.name}
                onSelect={onSelect}
              />
            ))
          )}
          <button
            type="button"
            className={`settings-skill__new-btn${isNew ? ' is-active' : ''}`}
            onClick={onNew}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden />
            新建 Skill
          </button>
        </div>
      </div>
    </aside>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`settings-skill__toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="settings-skill__toggle-knob" />
    </button>
  )
}

function SkillEditor({
  form,
  isNew,
  originalName,
  detailLoading,
  saving,
  deleting,
  canDelete,
  canSave,
  readOnly,
  error,
  setError,
  status,
  updateField,
  onSave,
  onDelete,
}) {
  const titleName = isNew
    ? form.name.trim() || 'new-skill'
    : form.name.trim() || originalName || 'skill'
  const showSystem = form.kind === 'quick_action'
  const systemRef = useRef(null)

  useEffect(() => {
    if (showSystem) autoResizeTextarea(systemRef.current)
  }, [showSystem, form.system])

  return (
    <section
      className={`settings-skill__editor${readOnly ? ' is-readonly' : ''}`}
    >
      <header className="settings-skill__editor-head">
        <h1>
          <span className="settings-skill__editor-name">{titleName}</span>
          <span className="settings-skill__editor-suffix"> · SKILL.md</span>
        </h1>
        <div className="settings-skill__editor-actions">
          {canDelete ? (
            <Button
              variant="ghost"
              type="button"
              onClick={onDelete}
              disabled={saving || deleting || detailLoading}
            >
              {deleting ? '删除中…' : '删除'}
            </Button>
          ) : null}
          {canSave ? (
            <Button
              variant="primary"
              type="button"
              onClick={onSave}
              disabled={saving || deleting || detailLoading}
            >
              {saving ? '保存中…' : '保存'}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="settings-skill__banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>
            关闭
          </button>
        </div>
      ) : null}

      {status.kind === 'success' && status.message ? (
        <p className="settings-skill__status" role="status">
          {status.message}
        </p>
      ) : null}

      {detailLoading ? (
        <p className="settings-skill__loading">加载详情中…</p>
      ) : (
        <>
          <h2 className="settings-skill__section-label">Frontmatter</h2>
          <div className="settings-skill__frontmatter">
            <div className="settings-skill__row">
              <label className="settings-field">
                <span className="settings-field__label">name</span>
                <input
                  className="settings-field__input settings-field__input--mono"
                  type="text"
                  name="name"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="场景节拍 或 scene-beat"
                  value={form.name}
                  readOnly={readOnly}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </label>
              <div className="settings-field">
                <span className="settings-field__label" id="skill-kind-label">
                  kind
                </span>
                <SettingsSelect
                  aria-labelledby="skill-kind-label"
                  value={form.kind}
                  options={SKILL_KIND_OPTIONS}
                  disabled={readOnly}
                  onChange={(v) => updateField('kind', v)}
                />
              </div>
            </div>

            <label className="settings-field">
              <span className="settings-field__label">description</span>
              <textarea
                className="settings-field__input settings-skill__textarea"
                name="description"
                rows={2}
                placeholder="功能说明；供列表展示，并为后续模型自动选用预留"
                value={form.description}
                readOnly={readOnly}
                onChange={(e) => updateField('description', e.target.value)}
              />
            </label>

            <div className="settings-field">
              <span className="settings-field__label">
                disable-model-invocation
              </span>
              <div className="settings-skill__toggle-row">
                <span className="settings-field__hint">
                  {form.disable_model_invocation
                    ? 'true（禁止模型根据 description 自动选用）'
                    : 'false（允许后续自动选用）'}
                </span>
                <Toggle
                  checked={form.disable_model_invocation}
                  disabled={readOnly}
                  onChange={(v) => updateField('disable_model_invocation', v)}
                />
              </div>
            </div>

            {showSystem ? (
              <label className="settings-field">
                <span className="settings-field__label">system</span>
                <textarea
                  ref={systemRef}
                  className="settings-field__input settings-skill__textarea settings-skill__system settings-field__input--mono"
                  name="system"
                  rows={3}
                  placeholder="quick_action 的 system 提示词"
                  value={form.system}
                  readOnly={readOnly}
                  onChange={(e) => {
                    updateField('system', e.target.value)
                    autoResizeTextarea(e.target)
                  }}
                />
              </label>
            ) : null}
          </div>

          <h2 className="settings-skill__section-label">正文</h2>
          <div className="settings-skill__body-wrap">
            <textarea
              className="settings-skill__body"
              name="user_template"
              spellCheck={false}
              placeholder={
                'Markdown 正文模板，支持 $worldview、$characters、$current_content、$user_input 等变量'
              }
              value={form.user_template}
              readOnly={readOnly}
              onChange={(e) => updateField('user_template', e.target.value)}
            />
          </div>
        </>
      )}
    </section>
  )
}

export function SkillSettingsPanel() {
  const state = useSkillSettings(true)

  if (state.loading) {
    return (
      <div className="settings-page__content settings-page__content--loading settings-page__content--skill">
        <p>加载技能库中…</p>
      </div>
    )
  }

  return (
    <div className="settings-page__content settings-page__content--skill">
      {state.loadErrors.length > 0 ? (
        <div className="settings-skill__load-errors" role="status">
          有 {state.loadErrors.length} 个技能文件加载失败（已跳过）
        </div>
      ) : null}

      <div className="settings-skill">
        <SkillList
          builtinSkills={state.builtinSkills}
          customSkills={state.customSkills}
          selectedKey={state.selectedKey}
          isNew={state.isNew}
          onSelect={state.selectSkill}
          onNew={state.handleNew}
        />
        <SkillEditor
          form={state.form}
          isNew={state.isNew}
          originalName={state.originalName}
          detailLoading={state.detailLoading}
          saving={state.saving}
          deleting={state.deleting}
          canDelete={state.canDelete}
          canSave={state.canSave}
          readOnly={state.readOnly}
          error={state.error}
          setError={state.setError}
          status={state.status}
          updateField={state.updateField}
          onSave={state.handleSave}
          onDelete={state.handleDelete}
        />
      </div>
    </div>
  )
}
