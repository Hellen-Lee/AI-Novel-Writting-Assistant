import { api } from './client'

/**
 * POST /onboarding/generate — 引导页 AI 一键生成设定（无状态，返回对齐四区块的 JSON）。
 * @param {object} payload - OnboardingGenerateRequest 字段
 * @returns {Promise<object>} OnboardingGenerateResponse
 */
export async function generateOnboardingSettings(payload) {
  // 全量/单区生成耗时较长（64K tokens 思考+输出常需 60-180s），
  // 覆盖 axios 默认 30s 超时。前端必须 > 后端 httpx timeout（180s），
  // 否则前端先到点抛 ECONNABORTED 而后端还在阻塞，终端无任何日志。
  // 此处给 300s 留足余量，后端 httpx=180s 先到点会抛 ModelClientError
  // 并在终端打 warning，前端能拿到 502 而不是超时。
  const { data } = await api.post('/onboarding/generate', payload, {
    timeout: 300000,
  })
  return data
}
