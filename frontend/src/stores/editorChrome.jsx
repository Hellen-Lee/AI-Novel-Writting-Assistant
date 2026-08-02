import { useMemo, useState } from 'react'
import { EditorChromeContext } from './editorChromeContext'

/** 编辑顶栏与编辑页共享的轻量状态（保存态等） */
export function EditorChromeProvider({ children }) {
  const [saveStatus, setSaveStatus] = useState('saved') // saved | dirty | saving

  const value = useMemo(
    () => ({ saveStatus, setSaveStatus }),
    [saveStatus],
  )

  return (
    <EditorChromeContext.Provider value={value}>
      {children}
    </EditorChromeContext.Provider>
  )
}
