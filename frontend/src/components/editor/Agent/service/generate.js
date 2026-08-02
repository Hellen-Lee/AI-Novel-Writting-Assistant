import { AI_PLACEHOLDER } from '../utils/constants'

/**
 * Agent 生成调用（占位）。
 * 后续改为流式 generate + AbortController（signal.abort()）。
 */
export async function runAgentGenerate({
  projectId: _projectId,
  skillName: _skillName,
  userInput: _userInput,
  tempRules: _tempRules,
  signal,
}) {
  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, 600)
    if (!signal) return
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

  return { content: AI_PLACEHOLDER, pending: true }
}
