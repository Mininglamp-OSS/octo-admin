import type { TFunction } from 'i18next'
import type { SystemSettingItem } from '../../api/system-setting'
import { categoryTitle } from './helpers'

/** Virtual groups that sit above the real categories. */
export const CHANGED_KEY = '__changed__'
export const OVERRIDDEN_KEY = '__overridden__'

interface CategoryNavProps {
  groups: [string, SystemSettingItem[]][]
  activeKey: string
  changedCount: number
  overriddenCount: number
  onSelect: (key: string) => void
  t: TFunction
}

interface NavItemProps {
  itemKey: string
  label: string
  count: number
  active: boolean
  dot?: 'brand' | 'warning'
  dotTitle?: string
  onSelect: (key: string) => void
}

function NavItem({ itemKey, label, count, active, dot, dotTitle, onSelect }: NavItemProps) {
  return (
    <button
      type="button"
      className={`setting-nav-item${active ? ' active' : ''}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(itemKey)}
    >
      <span className="setting-nav-label">{label}</span>
      {dot && (
        <span
          className={`setting-nav-dot${dot === 'warning' ? ' setting-nav-dot--warning' : ''}`}
          title={dotTitle}
        />
      )}
      <span className="setting-nav-count">{count}</span>
    </button>
  )
}

/**
 * Category rail. With 60+ settings across ~10 categories, only one category is
 * rendered at a time; this is how you move between them. The two virtual groups
 * on top answer the questions a long flat list cannot: "what did I just change?"
 * and "what does this environment override?".
 */
export default function CategoryNav({
  groups,
  activeKey,
  changedCount,
  overriddenCount,
  onSelect,
  t,
}: CategoryNavProps) {
  const hasVirtualGroup = changedCount > 0 || overriddenCount > 0

  return (
    <nav className="setting-nav" aria-label={t('nav.aria')}>
      {changedCount > 0 && (
        <NavItem
          itemKey={CHANGED_KEY}
          label={t('nav.changed')}
          count={changedCount}
          active={activeKey === CHANGED_KEY}
          dot="warning"
          onSelect={onSelect}
        />
      )}
      {overriddenCount > 0 && (
        <NavItem
          itemKey={OVERRIDDEN_KEY}
          label={t('nav.overridden')}
          count={overriddenCount}
          active={activeKey === OVERRIDDEN_KEY}
          onSelect={onSelect}
        />
      )}
      {hasVirtualGroup && <div className="setting-nav-divider" />}

      {groups.map(([category, items]) => (
        <NavItem
          key={category}
          itemKey={category}
          label={categoryTitle(t, category)}
          count={items.length}
          active={activeKey === category}
          dot={items.some((item) => item.configured) ? 'brand' : undefined}
          dotTitle={t('nav.dotOverridden')}
          onSelect={onSelect}
        />
      ))}
    </nav>
  )
}
