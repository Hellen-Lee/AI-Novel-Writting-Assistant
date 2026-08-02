import { getProject } from '../../../../api/projects'

/** 读取项目 settings 中供规则遮罩展示的只读字段 */
export async function fetchProjectRuleSettings(projectId) {
  const detail = await getProject(projectId)
  return {
    globalRules: detail?.settings?.global_rules || '',
    stylePreference: detail?.settings?.style_preference || '',
  }
}
