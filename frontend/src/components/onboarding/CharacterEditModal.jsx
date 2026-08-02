import { Plus, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

export function CharacterEditModal({
  open,
  mode,
  draft,
  onDraftChange,
  onClose,
  onSave,
}) {
  const title =
    mode === 'edit'
      ? `编辑角色 · ${draft?.name || ''}`
      : draft?.name
        ? `添加角色 · ${draft.name}`
        : '添加角色'

  return (
    <Modal
      open={open}
      title={title}
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={onSave}>
            保存
          </Button>
        </>
      }
    >
      <div className="onboarding-modal-field">
        <label htmlFor="char-name">角色名</label>
        <input
          id="char-name"
          value={draft?.name || ''}
          onChange={(e) => onDraftChange((d) => ({ ...d, name: e.target.value }))}
          placeholder="例如：林砚"
        />
      </div>
      <div className="onboarding-modal-field">
        <label htmlFor="char-role">角色定位</label>
        <input
          id="char-role"
          value={draft?.role || ''}
          onChange={(e) => onDraftChange((d) => ({ ...d, role: e.target.value }))}
          placeholder="例如：主角 / 女主 / 反派"
        />
      </div>
      <div className="onboarding-modal-field">
        <label htmlFor="char-profile">人物简介</label>
        <textarea
          id="char-profile"
          value={draft?.profile || ''}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, profile: e.target.value }))
          }
          placeholder="性格、身世、能力等"
        />
      </div>
      <div className="onboarding-modal-field">
        <label>人物关系</label>
        <p className="onboarding-rel-hint">左侧填写关系类型，右侧填写对方角色名</p>
        {(draft?.relationship || []).map((rel, index) => (
          <div className="onboarding-rel-row" key={`rel-${index}`}>
            <input
              value={rel.type}
              onChange={(e) =>
                onDraftChange((d) => {
                  const next = [...(d.relationship || [])]
                  next[index] = { ...next[index], type: e.target.value }
                  return { ...d, relationship: next }
                })
              }
              placeholder="关系"
            />
            <input
              value={rel.target}
              onChange={(e) =>
                onDraftChange((d) => {
                  const next = [...(d.relationship || [])]
                  next[index] = { ...next[index], target: e.target.value }
                  return { ...d, relationship: next }
                })
              }
              placeholder="对方角色"
            />
            <button
              type="button"
              aria-label="删除关系"
              onClick={() =>
                onDraftChange((d) => {
                  const next = (d.relationship || []).filter((_, i) => i !== index)
                  return {
                    ...d,
                    relationship: next.length ? next : [{ type: '', target: '' }],
                  }
                })
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="onboarding-rel-add"
          onClick={() =>
            onDraftChange((d) => ({
              ...d,
              relationship: [...(d.relationship || []), { type: '', target: '' }],
            }))
          }
        >
          <Plus size={12} />
          添加关系
        </button>
      </div>
    </Modal>
  )
}
