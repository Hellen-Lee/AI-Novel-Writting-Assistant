import { useContext } from 'react'
import { EditorChromeContext } from './editorChromeContext'

export function useEditorChrome() {
  const ctx = useContext(EditorChromeContext)
  if (!ctx) {
    throw new Error('useEditorChrome must be used within EditorChromeProvider')
  }
  return ctx
}
