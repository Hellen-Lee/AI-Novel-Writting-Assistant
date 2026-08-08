import { Bookmark, Maximize2, PenLine, Sparkles } from 'lucide-react'

export const AI_PLACEHOLDER =
  'AI 生成将在生成链路联调后接入；当前可编辑临时规则与会话界面。'

export const QUICK_ACTIONS = [
  { id: '续写', label: '续写', icon: PenLine },
  { id: '润色', label: '润色', icon: Sparkles },
  { id: '扩写', label: '扩写', icon: Maximize2 },
  { id: '生成设定', label: '生成设定', icon: Bookmark },
]

/** 界面占位模型列表（配置页接入前本地展示） */
export const MODEL_OPTIONS = [
  { id: 'deepseek', name: 'DeepSeek', desc: '默认' },
  { id: 'doubao', name: '豆包', desc: 'Pro' },
  { id: 'gpt-4o', name: 'GPT-4o', desc: 'OpenAI' },
  { id: 'claude', name: 'Claude', desc: 'Sonnet' },
  { id: 'qwen', name: '通义千问', desc: 'Plus' },
]
