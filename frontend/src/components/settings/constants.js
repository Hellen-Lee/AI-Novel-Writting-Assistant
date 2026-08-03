import { KeyRound, SlidersHorizontal, WandSparkles } from 'lucide-react'

export const SETTINGS_TABS = [
  {
    id: 'general',
    label: '通用',
    icon: SlidersHorizontal,
  },
  {
    id: 'api',
    label: 'API',
    icon: KeyRound,
  },
  {
    id: 'skill',
    label: 'skill',
    icon: WandSparkles,
  },
]

export const DEFAULT_TAB = 'api'

export const API_TIPS = [
  '密钥不会上传到任何服务器',
  'MVP 阶段使用单一模型配置',
  '上下文长度影响单次生成可参考的章节与设定范围',
  '建议先测试连接再开始创作',
]

export const PROVIDERS_TEXT =
  'OpenAI · Anthropic · DeepSeek · 通义千问 · 文心一言 · 任意 OpenAI 兼容网关'

/** 与后端 CONTEXT_WINDOW_CHOICES 对齐 */
export const CONTEXT_WINDOW_OPTIONS = [
  {
    value: 32768,
    label: '32K tokens',
    description: '适合短篇与轻量对话',
  },
  {
    value: 65536,
    label: '64K tokens',
    description: '平衡成本与上下文容量',
  },
  {
    value: 131072,
    label: '128K tokens',
    description: '推荐：长文创作与多章记忆',
  },
]

export const DEFAULT_CONTEXT_WINDOW = 131072

export const EMPTY_API_FORM = {
  api_base: '',
  api_key: '',
  model: '',
  context_window: DEFAULT_CONTEXT_WINDOW,
}

function normalizeContextWindow(value) {
  const n = Number(value)
  if (CONTEXT_WINDOW_OPTIONS.some((o) => o.value === n)) return n
  return DEFAULT_CONTEXT_WINDOW
}

export function configToForm(config) {
  return {
    api_base: config?.api_base || '',
    api_key: config?.api_key || '',
    model: config?.model || '',
    context_window: normalizeContextWindow(config?.context_window),
  }
}

/** 测试 / 拉模型列表时只带连接相关字段 */
export function toProbePayload(form) {
  return {
    api_base: form.api_base.trim(),
    api_key: form.api_key,
    model: form.model.trim(),
  }
}

export function toSavePayload(form) {
  return {
    api_base: form.api_base.trim(),
    api_key: form.api_key,
    model: form.model.trim(),
    context_window: normalizeContextWindow(form.context_window),
  }
}

export function contextWindowLabel(value) {
  const hit = CONTEXT_WINDOW_OPTIONS.find((o) => o.value === Number(value))
  return hit?.label || '128K tokens'
}
