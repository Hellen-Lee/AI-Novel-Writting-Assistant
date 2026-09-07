import { useCallback, useEffect, useRef, useState } from 'react'

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/**
 * 右侧栏宽度拖拽逻辑（与展示解耦，放独立文件）。
 * 通过容器上覆盖 CSS 变量 --agent-width 驱动子面板（Agent/Rules）同步拉伸。
 * 宽度持久化到 localStorage，刷新/重开页面后恢复。
 */
export function useResizablePanel({
  storageKey,
  defaultWidth = 320,
  min = 300,
  max = 600,
}) {
  const readInitial = useCallback(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw == null) return defaultWidth
      const parsed = parseInt(raw, 10)
      if (Number.isNaN(parsed)) return defaultWidth
      return clamp(parsed, min, max)
    } catch {
      return defaultWidth
    }
  }, [storageKey, defaultWidth, min, max])

  const [width, setWidth] = useState(readInitial)
  const [isDragging, setIsDragging] = useState(false)
  const dragState = useRef({ startX: 0, startWidth: 0, active: false })

  // 拖拽期间：全局禁止文本选中 + col-resize 光标
  const applyDragCursor = (on) => {
    document.body.style.userSelect = on ? 'none' : ''
    document.body.style.cursor = on ? 'col-resize' : ''
  }

  const handlePointerMove = useCallback(
    (e) => {
      const { startX, startWidth } = dragState.current
      // 把手位于右栏【左缘】：鼠标位移方向与宽度变化相反
      // （向右拖 => 分界线右移 => 右栏变窄；向左拖 => 变宽）
      const delta = e.clientX - startX
      setWidth(clamp(startWidth - delta, min, max))
    },
    [min, max],
  )

  const handlePointerUp = useCallback(() => {
    if (!dragState.current.active) return
    dragState.current.active = false
    setIsDragging(false)
    applyDragCursor(false)
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    // 持久化最终宽度（在 state 上做一次写入，避免闭包读旧值）
    setWidth((current) => {
      try {
        localStorage.setItem(storageKey, String(current))
      } catch {
        /* 忽略隐私模式等写入异常 */
      }
      return current
    })
  }, [handlePointerMove, storageKey])

  const onHandlePointerDown = useCallback(
    (e) => {
      e.preventDefault()
      dragState.current = {
        startX: e.clientX,
        startWidth: width,
        active: true,
      }
      setIsDragging(true)
      applyDragCursor(true)
      // 指针捕获：即使指针移出把手/窗口也能收到事件
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [width, handlePointerMove, handlePointerUp],
  )

  // 卸载兜底清理监听与光标
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      applyDragCursor(false)
    }
  }, [handlePointerMove, handlePointerUp])

  return { width, isDragging, onHandlePointerDown }
}
