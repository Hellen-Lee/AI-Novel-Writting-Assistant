import axios from 'axios'

/** 统一走 Vite 代理 `/api` → 后端 */
export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

export function getErrorMessage(error, fallback = '请求失败') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (error?.message) return error.message
  return fallback
}
