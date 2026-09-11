import { BookOpen, Maximize2, Sparkles, WandSparkles } from 'lucide-react'

export const AI_PLACEHOLDER = '正在生成…'

/**
 * 生成过程阶段枚举（仅前端暂态，不落盘）。
 * thinking → (tool_call)* → streaming → done
 * 例外终态：stopped(输出终止) / error(出错)
 */
export const AGENT_PHASE = {
  THINKING: 'thinking',
  TOOL_CALL: 'tool_call',
  STREAMING: 'streaming',
  STOPPED: 'stopped',
  ERROR: 'error',
  DONE: 'done',
}

/** 后端 agent_tools 工具名 → 中文文案（供 tool_call 状态行展示） */
export const TOOL_LABELS = {
  read_chapter: '读取章节',
  read_recent_work: '读取前文',
  get_outline: '读取大纲',
  search_memory: '检索设定',
}

/**
 * 哪些技能属于"改写既有段落"类，草稿卡允许显示「替换」。
 * 续写（追加）、闲聊/设定（非草稿）不显示「替换」。
 */
export const REPLACE_SKILLS = new Set(['润色', '改写', '扩写'])

/** 阶段中文短文案（气泡状态行 / 草稿卡 head 复用） */
export const PHASE_TEXT = {
  [AGENT_PHASE.THINKING]: '正在思考',
  [AGENT_PHASE.STREAMING]: '正在书写',
  [AGENT_PHASE.STOPPED]: '已终止',
  [AGENT_PHASE.TOOL_CALL]: '调用工具',
}

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
