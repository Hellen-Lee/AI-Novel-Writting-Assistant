import { Plus, X } from 'lucide-react'

export function RelationshipRows({ relationship, onChange }) {
  const rows = relationship || []

  const updateRow = (index, patch) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next)
  }

  const removeRow = (index) => {
    onChange(rows.filter((_, i) => i !== index))
  }

  const addRow = () => {
    onChange([...rows, { type: '', target: '' }])
  }

  return (
    <div className="memory-page__field">
      <label>人物关系</label>
      <p className="memory-page__field-hint">
        左侧填写关系类型，右侧填写对方角色名
      </p>
      <div className="memory-page__rel-rows">
        {rows.map((rel, index) => (
          <div className="memory-page__rel-row" key={`rel-${index}`}>
            <input
              value={rel.type}
              onChange={(e) => updateRow(index, { type: e.target.value })}
              placeholder="关系"
              aria-label={`关系类型 ${index + 1}`}
            />
            <input
              value={rel.target}
              onChange={(e) => updateRow(index, { target: e.target.value })}
              placeholder="对方角色"
              aria-label={`对方角色 ${index + 1}`}
            />
            <button
              type="button"
              className="memory-page__rel-remove"
              aria-label="删除关系"
              onClick={() => removeRow(index)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="memory-page__rel-add" onClick={addRow}>
        <Plus size={12} />
        添加关系
      </button>
    </div>
  )
}
