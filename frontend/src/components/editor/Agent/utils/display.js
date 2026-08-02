export function displayReadonly(text, empty = '（未配置）') {
  const value = (text || '').trim()
  return value || empty
}
