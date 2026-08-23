import { api } from './client'

/**
 * POST /onboarding/generate — 引导页 AI 一键生成设定（无状态，返回对齐四区块的 JSON）。
 * @param {object} payload - OnboardingGenerateRequest 字段
 * @returns {Promise<object>} OnboardingGenerateResponse
 */
export async function generateOnboardingSettings(payload) {
  // 全量/单区生成耗时较长，覆盖 axios 默认 30s 超时（后端最长 120s）
  const { data } = await api.post('/onboarding/generate', payload, {
    timeout: 120000,
  })
  return data
}
