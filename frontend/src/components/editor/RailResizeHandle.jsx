import './RailResizeHandle.css'

/**
 * 右侧栏左缘拖拽把手：默认透明，hover/拖拽时高亮竖向分隔线。
 * 命中区落在右栏盒子内（left:0, width:8px），不遮挡正文编辑区。
 */
export function RailResizeHandle({ isDragging, onPointerDown }) {
  return (
    <div
      className={`rail-resize-handle${isDragging ? ' is-dragging' : ''}`}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="拖拽调整右侧栏宽度"
      title="拖拽调整宽度"
    />
  )
}
