import { useCallback, useMemo, useRef, useState } from 'react'
import { EditorChromeContext } from './editorChromeContext'

/** 编辑顶栏与编辑页共享的轻量状态（保存态、编辑工具栏等） */
export function EditorChromeProvider({ children }) {
  const [saveStatus, setSaveStatus] = useState('saved') // saved | dirty | saving

  // 编辑工具栏（Agent/规则/导出）渲染在顶栏右侧。仅当显示相关的标志
  // （面板模式、临时规则）变化时才驱动重渲染；回调因每次渲染都会重建，
  // 放入 ref 持久化，避免无意义的 re-render 循环。
  const [toolbarUi, setToolbarUi] = useState(null) // { activeMode, panelOpen, hasTempRules }
  const toolbarHandlersRef = useRef({ onSelectAgent: null, onSelectRules: null, onExport: null })

  const registerToolbar = useCallback((flags) => {
    toolbarHandlersRef.current.onSelectAgent = flags.onSelectAgent
    toolbarHandlersRef.current.onSelectRules = flags.onSelectRules
    toolbarHandlersRef.current.onExport = flags.onExport
    setToolbarUi({
      activeMode: flags.activeMode,
      panelOpen: flags.panelOpen,
      hasTempRules: flags.hasTempRules,
    })
  }, [])

  const clearToolbar = useCallback(() => {
    setToolbarUi(null)
  }, [])

  const value = useMemo(
    () => ({
      saveStatus,
      setSaveStatus,
      // 顶栏消费的只读快照（含当下回调）
      toolbar: toolbarUi
        ? { ...toolbarUi, ...toolbarHandlersRef.current }
        : null,
      registerToolbar,
      clearToolbar,
    }),
    [saveStatus, toolbarUi, registerToolbar, clearToolbar],
  )

  return (
    <EditorChromeContext.Provider value={value}>
      {children}
    </EditorChromeContext.Provider>
  )
}
