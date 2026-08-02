export function createSession(title = '新对话') {
  return {
    id: `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    messages: [],
    updatedAt: Date.now(),
  }
}
