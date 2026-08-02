import { useEffect, useState } from 'react'
import { fetchProjectRuleSettings } from '../service/projectSettings'

export function useAgentRules({ projectId, panelMode }) {
  const [tempRules, setTempRules] = useState('')
  const [rulesDraft, setRulesDraft] = useState('')
  const [globalRules, setGlobalRules] = useState('')
  const [stylePreference, setStylePreference] = useState('')

  useEffect(() => {
    if (panelMode !== 'rules' || !projectId) return undefined
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
  }, [panelMode, projectId])

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
