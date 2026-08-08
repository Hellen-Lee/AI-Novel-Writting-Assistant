import { BookOpen, Maximize2, Sparkles, WandSparkles } from 'lucide-react'

export const AI_PLACEHOLDER =
  'AI 生成将在生成链路联调后接入；当前可编辑临时规则与会话界面。'

export const QUICK_ACTIONS = [
  {
    id: '续写',
    label: '续写',
    desc: '基于上下文续写一段',
    icon: WandSparkles,
  },
  {
    id: '润色',
    label: '润色',
    desc: '优化选中段落表达',
    icon: Sparkles,
  },
  {
    id: '扩写',
    label: '扩写',
    desc: '将简述扩成完整场景',
    icon: Maximize2,
  },
  {
    id: '生成设定',
    label: '生成设定',
    desc: '生成人物或世界观',
    icon: BookOpen,
  },
]

/** 界面占位模型列表（配置页接入前本地展示） */
export const MODEL_OPTIONS = [
  { id: 'deepseek', name: 'DeepSeek', desc: '默认' },
  { id: 'doubao', name: '豆包', desc: 'Pro' },
  { id: 'gpt-4o', name: 'GPT-4o', desc: 'OpenAI' },
  { id: 'claude', name: 'Claude', desc: 'Sonnet' },
  { id: 'qwen', name: '通义千问', desc: 'Plus' },
]
