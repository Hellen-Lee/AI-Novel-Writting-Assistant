import { SETTINGS_TABS } from './constants'

export function SettingsSidebar({ activeTab, onSelect }) {
  return (
    <aside className="settings-page__sidebar">
      <span className="settings-page__side-label">设置</span>
      <nav className="settings-page__nav" aria-label="设置分类">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              className={`settings-page__nav-item${active ? ' is-active' : ''}`}
              onClick={() => onSelect(tab.id)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={16} strokeWidth={2} aria-hidden />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
