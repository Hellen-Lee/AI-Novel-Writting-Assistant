import { api } from './client'

/** GET /api/config — 密钥为脱敏值 */
export async function getConfig() {
  const { data } = await api.get('/config')
  return data
}

/** POST /api/config — 脱敏密钥会被后端忽略并保留原值 */
export async function saveConfig(payload) {
  const { data } = await api.post('/config', payload)
  return data
}

/**
 * POST /api/config/test
 * 可用当前表单值覆盖已保存配置做探测（未保存也可测）
 */
export async function testConfig(overrides) {
  const { data } = await api.post('/config/test', overrides || {})
  return data
}

/**
 * POST /api/config/models
 * 用当前表单覆盖拉取可用模型列表
 */
export async function listModels(overrides) {
  const { data } = await api.post('/config/models', overrides || {})
  return data
}
