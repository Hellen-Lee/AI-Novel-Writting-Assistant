import { useRef, useState } from 'react'
import { ArrowUp, FilePlus2, Plus, Square, Sparkles, X } from 'lucide-react'
import '../../styles/InputBar.css'
import { ContextUsageRing } from './ContextUsageRing'
import { ModelPicker } from './ModelPicker'
import { AttachmentWorkspace } from './workspace'

function AttachMenu({ skills, onChooseFile, onChooseSkill }) {
  return (
    <div className="agent-panel__attach-menu" role="menu">
      <button type="button" role="menuitem" onClick={onChooseFile}>
        <FilePlus2 size={15} aria-hidden />
        添加文件
      </button>
      <button type="button" role="menuitem" onClick={onChooseSkill}>
        <Sparkles size={15} aria-hidden />
        添加技能
        <span className="agent-panel__attach-menu-count">
          {skills.length ? `${skills.length} 个` : '暂无'}
        </span>
      </button>
    </div>
  )
}

function SkillMenu({ skills, onSelect, onClose }) {
  return (
    <div className="agent-panel__skill-menu" role="menu">
      <div className="agent-panel__skill-menu-title">选择技能</div>
      {skills.length ? (
        skills.map((skill) => (
          <button
            key={skill.name}
            type="button"
            role="menuitem"
            title={skill.description}
            onClick={() => {
              onSelect(skill)
              onClose()
            }}
          >
            <Sparkles size={14} aria-hidden />
            <span>{skill.name}</span>
          </button>
        ))
      ) : (
        <div className="agent-panel__skill-empty">暂无可用技能</div>
      )}
    </div>
  )
}

/** 底栏：notice + 输入区（快捷指令仅出现在无消息空态） */
export function InputBar({
  notice,
  onDismissNotice,
  generating,
  input,
  onInputChange,
  onSend,
  onStop,
  selection = null,
  onClearSelection,
  attachmentItems = [],
  skillOptions = [],
  onUploadFiles,
  onRemoveAttachment,
  onAddSkill,
  contextUsage = null,
  modelOptions = [],
  selectedModel,
  modelOpen,
  modelId,
  onToggleModel,
  onSelectModel,
}) {
  const [attachOpen, setAttachOpen] = useState(false)
  const [skillOpen, setSkillOpen] = useState(false)
  const fileInputRef = useRef(null)
  return (
    <footer className="agent-panel__foot">
      {notice ? (
        <div className="agent-panel__notice" role="status">
          {notice}
          <button
            type="button"
            className="agent-panel__notice-close"
            aria-label="关闭提示"
            onClick={onDismissNotice}
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      <div className="agent-panel__composer">
        <AttachmentWorkspace
          items={attachmentItems}
          selection={selection}
          onRemoveItem={onRemoveAttachment}
          onClearSelection={onClearSelection}
        />
        <textarea
          className="agent-panel__input"
          rows={2}
          value={input}
          disabled={generating}
          placeholder={
            generating
              ? '正在生成回复，可点击终止…'
              : '直接对话，或输入 /技能名、点下方快捷指令…'
          }
          onChange={(e) => onInputChange(e.target.value)}
          onPaste={(e) => {
            const imageFiles = Array.from(e.clipboardData?.files || []).filter((file) =>
              file.type.startsWith('image/'),
            )
            if (imageFiles.length) {
              e.preventDefault()
              onUploadFiles?.(imageFiles)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <div className="agent-panel__toolrow">
          <div className="agent-panel__attach-wrap">
            <button
              type="button"
              className={`agent-panel__tool-btn${attachOpen ? ' is-open' : ''}`}
              aria-label="添加文件或技能"
              aria-expanded={attachOpen}
              title="添加文件或技能"
              onClick={() => {
                setAttachOpen((open) => !open)
                setSkillOpen(false)
              }}
            >
              <Plus size={16} />
            </button>
            {attachOpen ? (
              <AttachMenu
                skills={skillOptions}
                onChooseFile={() => {
                  fileInputRef.current?.click()
                  setAttachOpen(false)
                }}
                onChooseSkill={() => {
                  setSkillOpen(true)
                  setAttachOpen(false)
                }}
              />
            ) : null}
            {skillOpen ? (
              <SkillMenu
                skills={skillOptions}
                onSelect={onAddSkill}
                onClose={() => setSkillOpen(false)}
              />
            ) : null}
            <input
              ref={fileInputRef}
              className="agent-panel__file-input"
              type="file"
              multiple
              accept="image/*,.txt,.md,.docx,.pdf,.csv,.json"
              onChange={(e) => {
                onUploadFiles?.(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          <ModelPicker
            options={modelOptions}
            selectedModel={selectedModel}
            modelOpen={modelOpen}
            modelId={modelId}
            onToggleModel={onToggleModel}
            onSelectModel={onSelectModel}
          />

          <div className="agent-panel__toolrow-spacer" />

          <ContextUsageRing
            used={contextUsage?.used}
            window={contextUsage?.window}
            loading={generating}
          />

          {generating ? (
            <button
              type="button"
              className="agent-panel__send agent-panel__send--stop"
              aria-label="终止生成"
              onClick={onStop}
            >
              <Square size={10} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="agent-panel__send"
              aria-label="发送"
              onClick={onSend}
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </footer>
  )
}
