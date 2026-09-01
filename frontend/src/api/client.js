import axios from 'axios'

/** 统一走 Vite 代理 `/api` → 后端 */
export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

/**
 * 把任意请求异常转成可直接展示的中文提示。
 *
 * 覆盖三类来源：
 * - 后端结构化错误：`detail` 为字符串，或为 Pydantic 校验错误数组
 * - HTTP 状态错误：无 `detail` 时按状态码给出可操作的指引
 * - 网络层错误：无 `response`（后端未启动 / 断网 / 超时）
 */
export function getErrorMessage(error, fallback = '请求失败') {
  const detail = error?.response?.data?.detail

  if (typeof detail === 'string' && detail.trim()) return detail

  // Pydantic 校验错误：detail 是 [{ loc, msg, type }]
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0]
    const field = Array.isArray(first?.loc) ? first.loc.filter((p) => p !== 'body').join('.') : ''
    const msg = first?.msg || '参数不合法'
    return field ? `${field}: ${msg}` : msg
  }

  // 网络层：后端未启动、断网、超时
  if (!error?.response) {
    if (error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) {
      return '请求超时，请稍后重试'
    }
    return '无法连接到本地服务，请确认后端已启动'
  }

  const status = error.response.status
  if (status === 404) return '请求的资源不存在'
  if (status === 401 || status === 403) return 'API 密钥无效或无权限，请检查 API 设置'
  if (status === 502 || status === 504) return '无法连接模型服务，请检查 API 地址与网络'
  if (status >= 500) return '服务端出错，请查看后端日志'

  if (error?.message) return error.message
  return fallback
}
