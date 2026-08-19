import { MODE_LABEL, NONE_SESSION_ID } from './format'

export function sessionKey(sessionId) {
  const id = String(sessionId || '').trim()
  return id || NONE_SESSION_ID
}

export function groupRunsBySession(runs, titlesById = {}) {
  const map = new Map()
  for (const run of runs || []) {
    const id = sessionKey(run.session_id)
    if (!map.has(id)) {
      const titled = Boolean(titlesById[id])
      map.set(id, {
        sessionId: id,
        title: titlesById[id] || (id === NONE_SESSION_ID ? '未归属会话' : id),
        orphan: id === NONE_SESSION_ID || !titled,
        runs: [],
      })
    }
    map.get(id).runs.push(run)
  }

  const sessions = [...map.values()]
  for (const session of sessions) {
    session.runs.sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || '')),
    )
    const last = session.runs[session.runs.length - 1]
    session.updatedAt = last?.created_at || ''
    session.truncated = session.runs.some((item) => item.truncated)
    session.remainingPct = null
    for (let i = session.runs.length - 1; i >= 0; i -= 1) {
      const pct = session.runs[i]?.remaining_pct
      if (pct != null) {
        session.remainingPct = pct
        break
      }
    }
  }
  sessions.sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
  )
  return sessions
}

export function splitPipeline(steps) {
  const list = Array.isArray(steps) ? steps : []
  const router = list.find((step) => step?.mode === 'router') || null
  const exec =
    list.find((step) => step?.mode === 'skill' || step?.mode === 'chat') || null
  const summary = list.find((step) => step?.mode === 'summary') || null
  return { router, exec, summary, calls: list }
}

export function routeLabel(run) {
  if (Array.isArray(run?.steps) && run.steps.length) {
    const { router, exec } = splitPipeline(run.steps)
    return describeRoute(router, exec)
  }
  const modes = run?.modes || []
  const skill = (run?.skill_names && run.skill_names[0]) || ''
  if (modes.includes('router')) {
    if (skill) return `Router → ${skill}`
    if (modes.includes('chat')) return 'Router → 闲聊'
    return 'Router'
  }
  if (skill) return `指定 → ${skill}`
  if (modes.includes('chat')) return '闲聊'
  return '生成'
}

export function pipelineNodes(run) {
  const { router, exec, summary } = splitPipeline(run?.steps)
  const nodes = []
  if (router) {
    nodes.push({ id: 'router', label: 'Router', mode: 'router' })
  } else if (exec?.skill_source === 'explicit') {
    nodes.push({ id: 'explicit', label: '命令指定', mode: 'skill' })
  }
  if (exec?.mode === 'skill') {
    nodes.push({
      id: 'exec',
      label: exec.skill_name || 'Skill',
      mode: 'skill',
    })
  } else if (exec?.mode === 'chat') {
    const clarify = router?.decision === 'clarify'
    nodes.push({
      id: 'exec',
      label: clarify ? '澄清闲聊' : '闲聊',
      mode: 'chat',
    })
  }
  if (summary) {
    nodes.push({ id: 'summary', label: '摘要', mode: 'summary' })
  }
  return nodes
}

export function remainingFromSteps(steps) {
  const { exec } = splitPipeline(steps)
  const execPct = exec?.budget_report?.remaining_pct
  if (execPct != null) return execPct
  let last = null
  for (const step of steps || []) {
    const pct = step?.budget_report?.remaining_pct
    if (pct != null) last = pct
  }
  return last
}

export function turnLatency(run) {
  const steps = run?.steps
  if (Array.isArray(steps) && steps.length) {
    return steps.reduce((sum, step) => sum + (Number(step?.latency_ms) || 0), 0)
  }
  return Number(run?.latency_ms_total) || 0
}

export function assembledPromptBlocks(run) {
  const { router, exec } = splitPipeline(run?.steps)
  const blocks = [
    {
      key: 'user-input',
      prefix: '【用户输入】',
      text: run?.user_input || '',
    },
  ]
  pushPromptPair(blocks, router, 'router')
  pushPromptPair(blocks, exec, 'exec')
  return blocks
}

function promptTypeLabel(step) {
  if (!step) return '调用'
  if (step.mode === 'router') return 'Router'
  if (step.mode === 'skill') {
    return step.skill_name ? `Skill「${step.skill_name}」` : 'Skill'
  }
  return MODE_LABEL[step.mode] || step.mode || '调用'
}

function pushPromptPair(blocks, step, key) {
  if (!step) return
  const type = promptTypeLabel(step)
  blocks.push(
    {
      key: `${key}-system`,
      prefix: `【${type} · system】`,
      text: step.system || '',
    },
    {
      key: `${key}-user`,
      prefix: `【${type} · user】`,
      text: step.user || '',
    },
  )
}

export function callSummary(step) {
  const mode = step?.mode || ''
  if (mode === 'router') {
    const decision = step.decision || ''
    const skill = step.skill_name || ''
    if (decision === 'skill' && skill) return `选 skill「${skill}」`
    if (decision === 'clarify') return '需澄清，转闲聊'
    if (decision === 'chat') return '走闲聊'
    return step.reason || '选路'
  }
  if (mode === 'skill') {
    const kind = step.skill_kind ? ` · ${step.skill_kind}` : ''
    return `${step.skill_name || 'Skill'}${kind}`
  }
  if (mode === 'chat') return '写入对话气泡'
  if (mode === 'summary') {
    return step.fallback ? '摘要兜底（未调用模型）' : '压缩旧轮，不进气泡'
  }
  return mode || '调用'
}

function describeRoute(router, exec) {
  const skill = exec?.skill_name || ''
  if (router) {
    const decision = router.decision || ''
    if (decision === 'skill' && skill) return `Router → ${skill}`
    if (decision === 'clarify') return 'Router → 澄清'
    return 'Router → 闲聊'
  }
  if (exec?.skill_source === 'explicit' && skill) return `指定 → ${skill}`
  if (exec?.mode === 'skill') return skill || 'Skill'
  if (exec?.mode === 'chat') return '闲聊'
  return '生成'
}
