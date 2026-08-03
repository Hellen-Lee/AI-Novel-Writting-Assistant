import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ApiSettingsPanel } from '../components/settings/ApiSettingsPanel'
import { PlaceholderPanel } from '../components/settings/PlaceholderPanel'
import { SettingsSidebar } from '../components/settings/SettingsSidebar'
import { DEFAULT_TAB, SETTINGS_TABS } from '../components/settings/constants'
import './SettingsPage.css'

function resolveTab(raw) {
  const id = (raw || '').trim().toLowerCase()
  return SETTINGS_TABS.some((t) => t.id === id) ? id : DEFAULT_TAB
}

/** 全局设置 — 设计对照：Review/Screen/Settings-API（L857U） */
export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = useMemo(
    () => resolveTab(searchParams.get('tab')),
    [searchParams],
  )

  const selectTab = (tabId) => {
    setSearchParams(tabId === DEFAULT_TAB ? {} : { tab: tabId }, { replace: true })
  }

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <div className="settings-page__header-left">
          <Link to="/" className="settings-page__back" aria-label="返回首页">
            <ArrowLeft size={18} strokeWidth={2} />
          </Link>
          <h1 className="settings-page__title">全局设置</h1>
        </div>
        <p className="settings-page__local-note">配置仅保存在本地</p>
      </header>

      <div className="settings-page__body">
        <SettingsSidebar activeTab={activeTab} onSelect={selectTab} />

        {activeTab === 'api' ? (
          <ApiSettingsPanel />
        ) : activeTab === 'skill' ? (
          <PlaceholderPanel
            title="Skill 技能库"
            description="管理内置与自定义 SKILL.md（frontmatter + 正文模板），支持新建与编辑。"
          />
        ) : (
          <PlaceholderPanel
            title="通用"
            description="数据目录、自动保存、字数统计、删除确认等本地偏好将在此配置。"
          />
        )}
      </div>
    </div>
  )
}
