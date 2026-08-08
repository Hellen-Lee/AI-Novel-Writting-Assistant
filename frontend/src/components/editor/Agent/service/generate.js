import { streamGenerate } from '../../../../api/generate'

/**
 * Agent 生成：调用后端 SSE，经 onEvent / onDelta 回写 UI。
 */
export async function runAgentGenerate({
  projectId,
  sessionId,
  skillName,
  userInput,
  tempRules = '',
  chapterId,
  currentContent = '',
  selectedText = '',
  model,
  signal,
  onEvent,
  onDelta,
}) {
  const result = await streamGenerate({
    projectId,
    body: {
      session_id: sessionId,
      skill_name: skillName,
      chapter_id: chapterId || undefined,
      current_content: currentContent,
      selected_text: selectedText,
      user_input: userInput,
      chapter_rules: tempRules || '',
      model: model || undefined,
    },
    signal,
    onEvent: (ev) => {
      onEvent?.(ev)
      if (ev?.type === 'content' && ev.content) {
        onDelta?.(ev.content)
      }
    },
  })

  if (result.error && !result.content) {
    throw new Error(result.error)
  }

  return result
}
