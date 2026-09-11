import { streamGenerate } from '../../../../api/generate'

/**
 * Agent 生成：调用后端 SSE，经 onEvent / onDelta 回写 UI。
 * skillName 省略时走统一 agentic 路径；显式时为「预设」注入意图。
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
  contentAnchor,
  signal,
  onEvent,
  onDelta,
}) {
  const body = {
    session_id: sessionId,
    chapter_id: chapterId || undefined,
    current_content: currentContent,
    selected_text: selectedText,
    user_input: userInput,
    chapter_rules: tempRules || '',
    model: model || undefined,
  }
  if (contentAnchor) {
    body.content_anchor = contentAnchor
  }
  if (skillName) {
    body.skill_name = skillName
  }

  const result = await streamGenerate({
    projectId,
    body,
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
