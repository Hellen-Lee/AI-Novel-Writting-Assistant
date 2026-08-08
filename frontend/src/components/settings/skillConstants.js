import {
  BookOpen,
  Maximize2,
  PenLine,
  Puzzle,
  Sparkles,
} from 'lucide-react'

export const SKILL_KIND_OPTIONS = [
  { value: 'skill', label: 'skill' },
  { value: 'quick_action', label: 'quick_action' },
]

export const EMPTY_SKILL_FORM = {
  name: '',
  description: '',
  kind: 'skill',
  disable_model_invocation: true,
  system: '',
  user_template: '',
}

const NAME_ICON = {
  续写: PenLine,
  润色: Sparkles,
  扩写: Maximize2,
  生成设定: BookOpen,
}

export function skillIcon(name) {
  return NAME_ICON[name] || Puzzle
}

export function detailToForm(detail) {
  return {
    name: detail?.name || '',
    description: detail?.description || '',
    kind: detail?.kind === 'quick_action' ? 'quick_action' : 'skill',
    disable_model_invocation:
      detail?.disable_model_invocation !== undefined
        ? Boolean(detail.disable_model_invocation)
        : true,
    system: detail?.system || '',
    user_template: detail?.user_template || '',
  }
}

export function formToPayload(form) {
  const kind = form.kind === 'quick_action' ? 'quick_action' : 'skill'
  return {
    name: (form.name || '').trim(),
    description: (form.description || '').trim(),
    kind,
    disable_model_invocation: Boolean(form.disable_model_invocation),
    system: kind === 'quick_action' ? (form.system || '').trim() : '',
    user_template: (form.user_template || '').trim(),
  }
}
