import { useEffect, useState } from 'react'
import { fetchProjectRuleSettings } from '../service/projectSettings'

/** 临时规则 + 只读全局规则/文风；由 EditorPage 持有，供规则侧栏与生成链路共用 */
export function useAgentRules({ projectId, active }) {
  const [tempRules, setTempRules] = useState('')
  const [rulesDraft, setRulesDraft] = useState('')
  const [globalRules, setGlobalRules] = useState('')
  const [stylePreference, setStylePreference] = useState('')

  useEffect(() => {
    if (!active || !projectId) return undefined
    let cancelled = false
    fetchProjectRuleSettings(projectId)
      .then((settings) => {
        if (cancelled) return
        setGlobalRules(settings.globalRules)
        setStylePreference(settings.stylePreference)
      })
      .catch(() => {
        if (cancelled) return
        setGlobalRules('')
        setStylePreference('')
      })
    return () => {
      cancelled = true
    }
  }, [active, projectId])

  const openRules = () => {
    setRulesDraft(tempRules)
  }

  const handleRulesClear = () => {
    setRulesDraft('')
  }

  const handleRulesSave = () => {
    setTempRules(rulesDraft)
  }

  return {
    tempRules,
    rulesDraft,
    setRulesDraft,
    globalRules,
    stylePreference,
    openRules,
    handleRulesClear,
    handleRulesSave,
  }
}
