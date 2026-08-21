import { useEffect, useState, useMemo, useSyncExternalStore } from 'react'
import { Tabs, Spin, Empty, Tag, ConfigProvider, theme as antdTheme } from 'antd'
import {
  AndroidOutlined,
  AppleOutlined,
  GlobalOutlined,
  UnorderedListOutlined,
  ApiOutlined,
  PlusCircleOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  EllipsisOutlined,
  WarningOutlined,
  DownloadOutlined,
  TeamOutlined,
  MinusCircleOutlined,
  LockOutlined,
  CalendarOutlined,
  FireOutlined,
  ClockCircleOutlined,
  LineChartOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
  WindowsOutlined,
  LinuxOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import relativeTime from 'dayjs/plugin/relativeTime'
import api from '../../api'
import { colors, radius, space, font } from '../../styles/tokens'
import { parseUpdateDesc, getVersionSeverity, formatVersion, parseContributors, detectViewerOS, isHandheld, forcedPlatforms, groupReleases, orderBuilds, noteBlocks, latestDesktopDownloads, offerVersionLabel, offeredAbove, safeDownloadUrl, desktopPlatforms } from './utils'
import type { VersionSeverity, ChangeCategory, Contributor, ViewerOS, AppVersion, DesktopBuild, DesktopDownload, NoteBlock, ReleaseEntry } from './utils'
import type { PlatformKey } from '../../styles/tokens'
import { AnalyticsPanel } from './AnalyticsPanel'
import { useTheme } from '../../hooks/useTheme'
import type { Theme } from '../../hooks/useTheme'

dayjs.locale('zh-cn')
dayjs.extend(relativeTime)

const ChromeIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{ verticalAlign: '-0.125em' }}>
    {/* Red segment: 270°→30° (top to lower-right) */}
    <path d="M12 2 A10 10 0 0 1 20.66 17 L16.33 14.5 A5 5 0 0 0 12 7 Z" fill="#EA4335"/>
    {/* Yellow segment: 30°→150° (lower-right to lower-left) */}
    <path d="M20.66 17 A10 10 0 0 1 3.34 17 L7.67 14.5 A5 5 0 0 0 16.33 14.5 Z" fill="#FBBC05"/>
    {/* Green segment: 150°→270° (lower-left to top) */}
    <path d="M3.34 17 A10 10 0 0 1 12 2 L12 7 A5 5 0 0 0 7.67 14.5 Z" fill="#34A853"/>
    <circle cx="12" cy="12" r="4.8" fill="white"/>
    <circle cx="12" cy="12" r="4" fill="#4285F4"/>
  </svg>
)

const platformConfig: Record<string, { label: string; icon: React.ReactNode; tone: PlatformKey; color: string; colorDark: string }> = {
  android: { label: 'Android', icon: <AndroidOutlined />, tone: 'android', color: '#22c55e', colorDark: '#4ade80' },
  ios: { label: 'iOS', icon: <AppleOutlined />, tone: 'ios', color: '#334155', colorDark: '#cbd5e1' },
  web: { label: 'Web', icon: <GlobalOutlined />, tone: 'web', color: '#0ea5e9', colorDark: '#38bdf8' },
  windows: { label: 'Windows', icon: <WindowsOutlined />, tone: 'desktop', color: '#0d9488', colorDark: '#2dd4bf' },
  macos: { label: 'macOS', icon: <AppleOutlined />, tone: 'desktop', color: '#0d9488', colorDark: '#2dd4bf' },
  linux: { label: 'Linux', icon: <LinuxOutlined />, tone: 'desktop', color: '#0d9488', colorDark: '#2dd4bf' },
  'openclaw-plugin': { label: 'OpenClaw Plugin', icon: <ApiOutlined />, tone: 'openclaw-plugin', color: '#f97316', colorDark: '#fb923c' },
  chrome: { label: 'Chrome 扩展', icon: <ChromeIcon />, tone: 'chrome', color: '#4285f4', colorDark: '#60a5fa' },
}

const viewerOS: ViewerOS | null = typeof navigator === 'undefined'
  ? null
  : detectViewerOS(navigator.userAgent, navigator.maxTouchPoints)

const viewerIsHandheld: boolean = typeof navigator === 'undefined'
  ? false
  : isHandheld(navigator.userAgent, navigator.maxTouchPoints)

const tabItems = [
  { key: 'all', label: '全部', icon: <UnorderedListOutlined />, color: '', colorDark: '' },
  { key: 'web', label: 'Web', icon: <GlobalOutlined />, color: '#0ea5e9', colorDark: '#38bdf8' },
  { key: 'desktop', label: '桌面端', icon: <DesktopOutlined />, color: '#0d9488', colorDark: '#2dd4bf' },
  { key: 'android', label: 'Android', icon: <AndroidOutlined />, color: '#22c55e', colorDark: '#4ade80' },
  { key: 'ios', label: 'iOS', icon: <AppleOutlined />, color: '#334155', colorDark: '#cbd5e1' },
  { key: 'openclaw-plugin', label: 'OpenClaw Plugin', icon: <ApiOutlined />, color: '#f97316', colorDark: '#fb923c' },
  { key: 'chrome', label: 'Chrome 扩展', icon: <ChromeIcon />, color: '#4285f4', colorDark: '#60a5fa' },
]

const css = `
.download-link:focus-visible {
  outline: 2px solid var(--brand-solid);
  outline-offset: 2px;
  border-radius: 6px;
}
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.changelog-item {
  animation: fadeSlideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
}
/* Release notes quote code: a dotted config key or a file path is one unbreakable
   word, routinely past 60 characters, and no line-breaking opportunity exists
   inside it. Left alone such a word sets the min-content width of the note column,
   the timeline row cannot shrink below it, and every screen narrower than the word
   scrolls sideways — the whole page, not just the one line. */
.changelog-notes {
  /* word-break first for Safari below 15.4, which drops the anywhere keyword. The
     deprecated alias is the one that also shrinks min-content there; the
     break-word value of overflow-wrap does not, and min-content is what set the
     floor on the page width. */
  word-break: break-word;
  overflow-wrap: anywhere;
}
.contributor-group {
  display: flex;
  align-items: center;
  width: var(--reserved-w, auto);
}
.contributor-avatar {
  position: relative;
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 0;
}
.contributor-avatar:not(:first-child) {
  margin-left: -8px;
}
.contributor-avatar img {
  transition: transform 0.2s ease;
}
/* Fan the stack out on hover using transform only — no layout change, so the
   parent flex row never re-flows/wraps under the cursor (which caused flicker).
   Each avatar shifts right by index*4px, taking the per-avatar step from 16px to
   20px. The group already reserves this fanned width (inline), so the fan fills
   the reserved box exactly and never overflows the card. Avatars still overlap
   (20 < 24), so there are no gaps for the cursor to fall into. */
.contributor-group:hover .contributor-avatar {
  transform: translateX(calc(var(--contributor-index, 0) * 4px));
}
.contributor-avatar:hover {
  z-index: 10;
}
.contributor-avatar:hover img {
  transform: translateY(-4px) scale(1.2);
}
.contributor-avatar:hover .contributor-name {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.contributor-more-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--bg-page);
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  cursor: default;
}
/* Touch devices have no reliable hover; disable the fan/lift so a sticky
   tap-triggered :hover can't push avatars around or reveal the tooltip. */
@media (hover: none) {
  .contributor-group {
    width: auto;
  }
  .contributor-group:hover .contributor-avatar {
    transform: none;
  }
  .contributor-avatar:hover img {
    transform: none;
  }
  /* Not just transparent: an absolutely positioned tooltip still counts toward the
     document's scrollable width, and near the right edge of a phone that is enough
     to make the page scroll sideways to reveal a name nobody can trigger. */
  .contributor-name {
    display: none;
  }
}
.contributor-name {
  position: absolute;
  bottom: -22px;
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  background: var(--text-primary);
  color: var(--bg-page);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.heatmap-cell {
  width: 13px;
  height: 13px;
  border-radius: 0;
  cursor: default;
  transition: opacity 0.15s;
  box-shadow: var(--heatmap-cell-shadow);
}
.heatmap-cell:hover {
  opacity: 0.75;
}

.changelog-tabs .ant-tabs-tab {
  border-radius: ${radius.md}px !important;
  padding: 6px 14px !important;
  transition: background 0.2s, color 0.2s;
}
.changelog-tabs .ant-tabs-tab-active {
  background: transparent !important;
}
.changelog-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
  color: var(--tabs-ink-active) !important;
}
.changelog-tabs .ant-tabs-ink-bar {
  background: var(--tabs-indicator) !important;
}
.changelog-tabs .ant-tabs-nav::before {
  border-bottom-color: var(--tabs-divider) !important;
}

.theme-toggle {
  margin-left: auto;
  padding: 8px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  transition: color 0.2s, background 0.2s;
}
.theme-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
`

const HEATMAP_WEEKS = 10

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function getHeatmapColor(count: number): string {
  if (count === 0) return 'var(--heatmap-0)'
  if (count === 1) return 'var(--heatmap-1)'
  if (count === 2) return 'var(--heatmap-2)'
  if (count <= 4) return 'var(--heatmap-3)'
  return 'var(--heatmap-4)'
}

function Heatmap({ data }: { data: AppVersion[] }) {
  const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null)

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    data.forEach((item) => {
      const date = item.created_at.slice(0, 10)
      map[date] = (map[date] || 0) + 1
    })
    return map
  }, [data])

  const weeks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dow = today.getDay()
    const toMonday = dow === 0 ? 6 : dow - 1
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + (6 - toMonday))
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - HEATMAP_WEEKS * 7 + 1)

    const result: { date: string; count: number }[][] = []
    const cur = new Date(startDate)
    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      const week: { date: string; count: number }[] = []
      for (let d = 0; d < 7; d++) {
        const dateStr = cur.toISOString().slice(0, 10)
        week.push({ date: dateStr, count: counts[dateStr] || 0 })
        cur.setDate(cur.getDate() + 1)
      }
      result.push(week)
    }
    return result
  }, [counts])

  const weekLabels = useMemo(() => {
    let lastMonth = -1
    return weeks.map((week) => {
      const d = new Date(week[0].date)
      const month = d.getMonth()
      if (month !== lastMonth) {
        lastMonth = month
        return MONTH_NAMES[month]
      }
      return ''
    })
  }, [weeks])

  const totalReleases = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts])

  const stats = useMemo(() => {
    const avgPerWeek = totalReleases / HEATMAP_WEEKS
    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]
    const weekTotals: number[] = Array(HEATMAP_WEEKS).fill(0)

    weeks.forEach((week, wi) => {
      week.forEach((day, di) => {
        dayOfWeekCounts[di] += day.count
        weekTotals[wi] += day.count
      })
    })

    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const busiestDayIdx = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))
    const busiestDay = dayNames[busiestDayIdx]
    const busiestDayCount = dayOfWeekCounts[busiestDayIdx]

    const half = Math.floor(HEATMAP_WEEKS / 2)
    const firstHalf = weekTotals.slice(0, half).reduce((a, b) => a + b, 0)
    const secondHalf = weekTotals.slice(half).reduce((a, b) => a + b, 0)
    const trendPct = firstHalf > 0 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0

    const latestRelease = data[0]
    const sinceLastRelease = latestRelease ? dayjs(latestRelease.created_at).fromNow() : '—'

    return { avgPerWeek, busiestDay, busiestDayCount, trendPct, sinceLastRelease }
  }, [weeks, totalReleases, data])

  const DAY_LABEL_W = 32

  return (
    <div style={{
      padding: '14px 18px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: 10 }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.text.primary }}>Release Activity</span>
        <span style={{ fontSize: font.size.xs, color: colors.text.tertiary }}>{totalReleases} releases · {HEATMAP_WEEKS}w</span>
      </div>

      <div style={{ display: 'flex', gap: space[6], alignItems: 'flex-start' }}>
        <div data-heatmap style={{ display: 'inline-block', position: 'relative', flexShrink: 0 }}>
          {tooltip && (
            <div style={{
              position: 'absolute',
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -100%)',
              marginTop: -6,
              background: colors.text.primary,
              color: 'var(--bg-page)',
              fontSize: font.size.xs,
              padding: '4px 8px',
              borderRadius: radius.sm,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 100,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}>
              {tooltip.content}
            </div>
          )}

          <div style={{ display: 'flex', gap: 2, marginBottom: 4, paddingLeft: DAY_LABEL_W }}>
            {weeks.map((_, wi) => (
              <div key={wi} style={{ width: 13, fontSize: 8, color: colors.text.tertiary, flexShrink: 0, lineHeight: '10px', overflow: 'visible', whiteSpace: 'nowrap' }}>
                {weekLabels[wi] || ''}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 2 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 4, width: 28 }}>
              {['一', '', '三', '', '五', '', ''].map((d, i) => (
                <div key={i} style={{ height: 13, fontSize: 9, color: colors.text.tertiary, lineHeight: '13px', textAlign: 'right' }}>
                  {d}
                </div>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {week.map((day, di) => (
                  <div
                    key={di}
                    className="heatmap-cell"
                    style={{ background: getHeatmapColor(day.count) }}
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      const parent = (e.currentTarget as HTMLElement).closest('[data-heatmap]')!.getBoundingClientRect()
                      const content = day.count
                        ? `${day.date}：${day.count} 次发布`
                        : `${day.date}：暂无发布`
                      setTooltip({
                        content,
                        x: rect.left - parent.left + rect.width / 2,
                        y: rect.top - parent.top,
                      })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: space[2] }}>
            <span style={{ fontSize: 9, color: colors.text.tertiary, marginRight: 2 }}>少</span>
            {[0, 1, 2, 3, 5].map((v) => (
              <div key={v} className="heatmap-cell" style={{ background: getHeatmapColor(v) }} />
            ))}
            <span style={{ fontSize: 9, color: colors.text.tertiary, marginLeft: 2 }}>多</span>
          </div>
        </div>

        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: `${space[3]}px ${space[4]}px`,
          paddingTop: 14,
        }}>
          {([
            { label: '平均每周', value: `${stats.avgPerWeek.toFixed(1)} 次`, icon: <CalendarOutlined /> },
            { label: '最活跃的天', value: `${stats.busiestDay}（${stats.busiestDayCount} 次）`, icon: <FireOutlined /> },
            { label: '最近发版', value: stats.sinceLastRelease, icon: <ClockCircleOutlined /> },
            {
              label: '趋势',
              icon: <LineChartOutlined />,
              value: stats.trendPct === 0 ? '↔ 持平' : stats.trendPct > 0 ? `↑ +${stats.trendPct}%` : `↓ ${stats.trendPct}%`,
              valueColor: stats.trendPct > 0 ? colors.category.added.icon : stats.trendPct < 0 ? colors.category.fixed.icon : colors.text.tertiary,
            },
          ] as const).map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: font.size.xs, color: colors.text.tertiary, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11 }}>{s.icon}</span>
                {s.label}
              </div>
              <div style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, color: 'valueColor' in s ? s.valueColor : colors.text.primary }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Stacked contributor avatars. Collapsed (overlapped) at rest, gently fanned
// out on hover. The group reserves its *fanned* width up front so the surrounding
// flex row accounts for it — the fan happens inside that reserved box and can
// never overflow the card (the whole group wraps to its own line if too wide).
const MAX_VISIBLE_CONTRIBUTORS = 10
/* The avatar row is the one part of an entry that refuses to shrink: ten 24px
   avatars and a "+N" badge come to 184px, while a 360px phone leaves the note
   column about 200px after the page padding, the date gutter and the rail. At the
   full count the faces — not the prose — decide how wide the page is, and the page
   scrolls sideways. Show fewer of them there; the badge still counts the rest. */
const MAX_VISIBLE_CONTRIBUTORS_NARROW = 5
const NARROW_SCREEN = '(max-width: 420px)'

/* Resolved once and shared: getSnapshot runs on every render of every card, and
   matchMedia hands back a new object each call. */
let narrowScreenMedia: MediaQueryList | null | undefined

function narrowScreenQuery(): MediaQueryList | null {
  if (narrowScreenMedia === undefined) {
    narrowScreenMedia = typeof window === 'undefined' || !window.matchMedia ? null : window.matchMedia(NARROW_SCREEN)
  }
  return narrowScreenMedia
}

function subscribeToWidth(notify: () => void): () => void {
  const query = narrowScreenQuery()
  if (!query) return () => {}
  // Safari below 14 exposes only the deprecated addListener, and this runs inside
  // useSyncExternalStore's subscribe: throwing here takes the page down rather than
  // leaving the avatar row at its wider cap.
  if (typeof query.addEventListener !== 'function') {
    query.addListener(notify)
    return () => query.removeListener(notify)
  }
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribeToWidth, () => narrowScreenQuery()?.matches ?? false, () => false)
}
const AVATAR_SIZE = 24
// Per-avatar step: 16px at rest (8px overlap, via margin-left:-8px in CSS) →
// 20px on hover (4px overlap). The group reserves the fanned width below.
const FAN_STEP = 20

function ContributorAvatars({ contributors, showLabel }: { contributors: Contributor[]; showLabel?: boolean }) {
  const narrow = useNarrowScreen()
  if (contributors.length === 0) return null

  const cap = narrow ? MAX_VISIBLE_CONTRIBUTORS_NARROW : MAX_VISIBLE_CONTRIBUTORS
  const visible = contributors.slice(0, cap)
  const overflow = contributors.slice(cap)
  const itemCount = visible.length + (overflow.length > 0 ? 1 : 0)
  const reservedWidth = (itemCount - 1) * FAN_STEP + AVATAR_SIZE

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {showLabel && !narrow && (
        <span style={{ fontSize: font.size.xs, color: colors.text.tertiary, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <TeamOutlined />
          贡献者
        </span>
      )}
      <div
        className="contributor-group"
        style={{ ['--reserved-w' as string]: `${reservedWidth}px`, flexShrink: 0 } as React.CSSProperties}
      >
        {visible.map((c, index) => (
          <div
            key={`${c.name}-${index}`}
            className="contributor-avatar"
            style={{ ['--contributor-index' as string]: index } as React.CSSProperties}
          >
            <img
              src={c.avatar}
              alt={c.name}
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = c.fallbackAvatar
              }}
              style={{
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                borderRadius: '50%',
                border: `2px solid var(--bg-page)`,
                background: colors.surface.subtle,
                display: 'block',
                opacity: 0.9,
              }}
            />
            <span className="contributor-name">{c.name}</span>
          </div>
        ))}
        {overflow.length > 0 && (
          <div
            className="contributor-avatar"
            style={{ ['--contributor-index' as string]: visible.length } as React.CSSProperties}
            title={overflow.map((c) => c.name).join('、')}
          >
            <span className="contributor-more-badge">+{overflow.length}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PlatformBadge({ platform }: { platform: string }) {
  const cfg = platformConfig[platform]
  const platformColors = cfg ? colors.platform[cfg.tone] : undefined
  if (!cfg || !platformColors) {
    return <Tag style={{ margin: 0, fontSize: font.size.xs, borderRadius: radius.pill }}>{platform}</Tag>
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: font.size.xs,
      fontWeight: font.weight.medium,
      padding: '2px 10px',
      borderRadius: radius.pill,
      background: platformColors.bg,
      color: platformColors.text,
      border: `1px solid color-mix(in srgb, ${platformColors.base} 20%, transparent)`,
      lineHeight: '20px',
    }}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

/** Every platform this release covers — desktop shows one badge per installer. */
function EntryBadges({ entry }: { entry: ReleaseEntry }) {
  if (!entry.builds) return <PlatformBadge platform={entry.os} />
  return (
    <>
      {orderBuilds(entry.builds, viewerOS).map((build) => (
        <PlatformBadge key={build.os} platform={build.os} />
      ))}
    </>
  )
}

/**
 * One link per desktop installer. When we recognise the visitor's OS their build
 * leads and is the only filled button; otherwise every build is offered with
 * equal weight rather than guessing at them.
 */
function DesktopDownloads({ builds, compact, large }: { builds: DesktopBuild[]; compact?: boolean; large?: boolean }) {
  // The band above the timeline already told a handheld visitor to open the page on
  // a computer. Offering them the same installers a few hundred pixels below would
  // contradict that sentence with the buttons it exists to withdraw.
  if (viewerIsHandheld) return null

  const ordered = orderBuilds(builds, viewerOS)
    .map((build) => ({ ...build, href: safeDownloadUrl(build.download_url) }))
    .filter((build): build is typeof build & { href: string } => build.href !== null)
  if (ordered.length === 0) return null
  const knowsViewer = ordered[0].os === viewerOS

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: compact ? space[4] : space[2],
      flexWrap: 'wrap',
      marginTop: compact ? space[3] : 0,
    }}>
      {ordered.map((build, index) => {
        const isLead = index === 0 && knowsViewer
        const base: React.CSSProperties = {
          display: 'inline-flex',
          alignItems: 'center',
          gap: large ? 6 : 4,
          fontSize: large ? font.size.base : font.size.sm,
          fontWeight: isLead ? font.weight.semibold : font.weight.medium,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }
        // Underline carries the affordance inline; at button size a border reads
        // better next to the filled one.
        const quiet: React.CSSProperties = large
          ? { color: colors.text.secondary, background: colors.surface.card, border: `1px solid ${colors.surface.border}`, borderRadius: radius.md }
          : { color: colors.text.secondary, textDecoration: 'underline' }
        const style: React.CSSProperties = compact
          ? isLead || !knowsViewer
            ? { ...base, color: 'var(--brand-solid)' }
            : { ...base, ...quiet }
          : isLead
            ? { ...base, color: 'var(--brand-contrast)', background: 'var(--brand-solid)', border: '1px solid var(--brand-solid)', padding: large ? '10px 22px' : '5px 14px', borderRadius: large ? radius.md : radius.sm }
            : knowsViewer
              ? { ...base, ...quiet, padding: large ? '10px 14px' : '5px 10px' }
              : { ...base, color: 'var(--brand-solid)', border: '1px solid var(--brand-solid)', padding: large ? '9px 20px' : '4px 12px', borderRadius: large ? radius.md : radius.sm }

        return (
          <a key={build.os} className="download-link" href={build.href} target="_blank" rel="noopener noreferrer" style={style}>
            <DownloadOutlined />
            下载 {platformConfig[build.os]?.label ?? build.os}
          </a>
        )
      })}
    </div>
  )
}

const CATEGORY_CONFIG: Record<ChangeCategory, { label: string; icon: React.ReactNode; color: { icon: string; bg: string; text: string } }> = {
  security: { label: '安全', icon: <LockOutlined />, color: colors.category.security },
  removed: { label: '移除', icon: <MinusCircleOutlined />, color: colors.category.removed },
  fixed: { label: '修复', icon: <ToolOutlined />, color: colors.category.fixed },
  added: { label: '新增', icon: <PlusCircleOutlined />, color: colors.category.added },
  changed: { label: '优化', icon: <ThunderboltOutlined />, color: colors.category.changed },
  other: { label: '其他', icon: <EllipsisOutlined />, color: colors.category.other },
}

const TIME_TAG_PATTERN = /@@TIME:(\d{2}:\d{2})@@/

function splitByTimeTag(desc: string): { time: string | null; content: string }[] {
  const parts = desc.split(TIME_TAG_PATTERN)
  if (parts.length === 1) return [{ time: null, content: desc }]

  const result: { time: string | null; content: string }[] = []
  const leading = parts[0].trim()
  if (leading) result.push({ time: null, content: leading })

  for (let i = 1; i < parts.length; i += 2) {
    const time = parts[i]
    const content = (parts[i + 1] || '').trim()
    if (content) result.push({ time, content })
  }
  return result
}

function countChanges(parsed: ReturnType<typeof parseUpdateDesc>): number {
  return parsed.added.length + parsed.fixed.length + parsed.changed.length
    + parsed.removed.length + parsed.security.length + parsed.other.length
}

function StructuredChanges({ desc }: { desc: string }) {
  const sections = useMemo(() => splitByTimeTag(desc), [desc])
  const hasMultipleSections = sections.length > 1

  if (!desc) {
    return <span style={{ color: colors.text.tertiary }}>No description provided.</span>
  }

  return (
    <div className="changelog-notes" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {sections.map((section, si) => {
        const parsed = parseUpdateDesc(section.content)
        const categories = (['added', 'changed', 'fixed', 'security', 'removed', 'other'] as const).filter((k) => parsed[k].length > 0)
        const totalChanges = countChanges(parsed)

        return (
          <div key={si} style={{ paddingTop: si > 0 ? space[5] : 0 }}>
            {si > 0 && hasMultipleSections && (
              <div style={{
                borderTop: '1px dashed var(--divider-item)',
                marginBottom: space[4],
              }} />
            )}
            {hasMultipleSections && section.time && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: space[3],
              }}>
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--platform-web-base)',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: font.size.base,
                  fontWeight: font.weight.semibold,
                  color: colors.text.primary,
                  letterSpacing: '0.3px',
                }}>
                  {section.time}
                </span>
                <span style={{ fontSize: font.size.xs, color: colors.text.tertiary }}>
                  · {totalChanges} 项变更
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], paddingLeft: hasMultipleSections ? 14 : 0 }}>
              {categories.map((key) => {
                const cfg = CATEGORY_CONFIG[key]
                return (
                  <div key={key}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: font.size.sm,
                      fontWeight: font.weight.semibold,
                      color: cfg.color.text,
                      background: cfg.color.bg,
                      padding: '2px 8px',
                      borderRadius: radius.sm,
                      marginBottom: space[1],
                    }}>
                      <span style={{ color: cfg.color.icon }}>{cfg.icon}</span>
                      {cfg.label}
                    </div>
                    {(() => {
                      const items = parsed[key]
                      const groups: { name?: string; items: typeof items }[] = []
                      for (const it of items) {
                        const last = groups[groups.length - 1]
                        if (last && last.name === it.group) last.items.push(it)
                        else groups.push({ name: it.group, items: [it] })
                      }
                      return groups.map((g, gi) => (
                        <div key={gi} style={{ marginTop: gi > 0 ? space[2] : 0 }}>
                          {g.name && (
                            <div style={{
                              fontSize: font.size.sm,
                              fontWeight: font.weight.semibold,
                              color: colors.text.secondary,
                              marginTop: space[1],
                              marginBottom: 2,
                            }}>
                              {g.name}
                            </div>
                          )}
                          <ul style={{ margin: 0, paddingLeft: 20, listStyle: 'disc' }}>
                            {g.items.map((it, i) => (
                              <li key={i} style={{ color: colors.text.secondary, fontSize: font.size.base, lineHeight: 1.75 }}>
                                {it.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Get-the-app strip above the timeline. The desktop card sinks below a week of web
 * deploys within days, so the installer cannot only live where its release sits —
 * one button per OS that has a build, the visitor's own promoted.
 */
export function DesktopDownloadBar({ downloads, handheld = viewerIsHandheld }: {
  downloads: DesktopDownload[]
  handheld?: boolean
}) {
  if (downloads.length === 0) return null

  const versionLabel = offerVersionLabel(downloads)
  // Same order the buttons take, so the line does not read "Windows、macOS" above a
  // macOS-first row. On a handheld no platform is the visitor's, so the fallback
  // order applies and the sentence reads the same for everyone.
  const platforms = orderBuilds(downloads, viewerOS).map((build) => platformConfig[build.os]?.label ?? build.os).join('、')

  // A phone cannot run either installer, so the offer is news rather than an
  // action: one quiet line that says the desktop app exists, instead of a band of
  // dead buttons between the visitor and the page they came for.
  if (handheld) {
    return (
      // One text flow rather than a flex row: the sentence wraps to two lines on a
      // phone, and as a flex item it would drag the icon onto a line of its own.
      <section aria-label="Octo 桌面端" style={{
        marginBottom: space[5],
        fontSize: font.size.sm,
        lineHeight: 1.6,
        color: colors.text.tertiary,
      }}>
        <DesktopOutlined style={{ color: 'var(--brand-text-on-bg)', marginRight: 6 }} />
        Octo 桌面端{versionLabel && ` ${versionLabel}`} 支持 {platforms}，在电脑上打开本页即可下载
      </section>
    )
  }

  return (
    // Labelled: these are the first focusable things on the page, ahead of its <h1>.
    <section aria-label="下载 Octo 桌面端" style={{
      display: 'flex',
      alignItems: 'center',
      gap: space[5],
      flexWrap: 'wrap',
      padding: space[6],
      marginBottom: space[8],
      background: 'var(--brand-bg)',
      border: '1px solid color-mix(in srgb, var(--brand) 24%, transparent)',
      borderRadius: radius.xl,
    }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 48,
        flexShrink: 0,
        borderRadius: radius.lg,
        background: colors.surface.card,
        border: '1px solid color-mix(in srgb, var(--brand) 18%, transparent)',
      }}>
        <DesktopOutlined style={{ fontSize: 22, color: 'var(--brand-text-on-bg)' }} />
      </span>

      <div style={{ minWidth: 0 }}>
        <h2 style={{
          margin: 0,
          fontSize: font.size.lg,
          fontWeight: font.weight.bold,
          color: colors.text.primary,
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
        }}>
          Octo 桌面端
        </h2>
        <div style={{ fontSize: font.size.base, color: colors.text.secondary, marginTop: 2 }}>
          {versionLabel && `${versionLabel} · `}支持 {platforms}
        </div>
      </div>

      <span style={{ flex: 1, minWidth: space[4] }} />
      <DesktopDownloads builds={downloads} large />
    </section>
  )
}

/** Notes as each platform filed them — never merged, so a line keeps the section
 *  its own author put it under. */
function ReleaseNotes({ blocks }: { blocks: NoteBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <div key={block.os.join('-') || index} style={{ marginTop: index > 0 ? space[5] : 0 }}>
          {block.os.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: font.size.xs,
              fontWeight: font.weight.semibold,
              color: colors.text.tertiary,
              marginBottom: space[2],
            }}>
              {block.os.map((os) => platformConfig[os]?.label ?? os).join(' · ')}
            </div>
          )}
          <StructuredChanges desc={block.desc} />
        </div>
      ))}
    </>
  )
}

function blockStats(blocks: NoteBlock[]): { added: number; fixed: number; changed: number } {
  return blocks.reduce(
    (total, block) => {
      const stats = getChangeStats(block.desc)
      return {
        added: total.added + stats.added,
        fixed: total.fixed + stats.fixed,
        changed: total.changed + stats.changed,
      }
    },
    { added: 0, fixed: 0, changed: 0 },
  )
}

function blockContributors(blocks: NoteBlock[]): Contributor[] {
  const seen = new Set<string>()
  const all: Contributor[] = []
  for (const block of blocks) {
    for (const contributor of parseContributors(block.desc)) {
      if (seen.has(contributor.name)) continue
      seen.add(contributor.name)
      all.push(contributor)
    }
  }
  return all
}

function getChangeStats(desc: string): { added: number; fixed: number; changed: number } {
  const sections = splitByTimeTag(desc)
  let added = 0, fixed = 0, changed = 0
  for (const section of sections) {
    const parsed = parseUpdateDesc(section.content)
    added += parsed.added.length
    fixed += parsed.fixed.length
    changed += parsed.changed.length + parsed.removed.length + parsed.security.length + parsed.other.length
  }
  return { added, fixed, changed }
}

function getSeverityStyle(severity: VersionSeverity): React.CSSProperties {
  if (severity === 'major') return { borderLeft: `4px solid ${colors.platform.ios.base}`, paddingLeft: space[4] }
  if (severity === 'minor') return { borderLeft: '3px solid color-mix(in srgb, var(--platform-web-base) 25%, transparent)', paddingLeft: space[4] }
  if (severity === 'initial') return { borderLeft: `4px solid ${colors.category.added.icon}`, paddingLeft: space[4] }
  return {}
}

const SEVERITY_TAG_CONFIG: Partial<Record<VersionSeverity, { label: string; bg: string; color: string }>> = {
  major: { label: 'Major Release', bg: 'var(--sev-major-bg)', color: 'var(--sev-major-text)' },
  initial: { label: 'Initial Release', bg: 'var(--sev-initial-bg)', color: 'var(--sev-initial-text)' },
  'pre-release': { label: 'Pre-release', bg: 'var(--sev-prerelease-bg)', color: 'var(--sev-prerelease-text)' },
  minor: { label: 'Minor', bg: 'var(--sev-minor-bg)', color: 'var(--sev-minor-text)' },
  patch: { label: 'Patch', bg: 'var(--sev-patch-bg)', color: 'var(--sev-patch-text)' },
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' }
  const icons: Record<Theme, React.ReactNode> = {
    auto: <DesktopOutlined />,
    light: <SunOutlined />,
    dark: <MoonOutlined />,
  }
  const labels: Record<Theme, string> = { auto: '跟随系统', light: '浅色', dark: '深色' }

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(next[theme])}
      title={`主题：${labels[theme]}（点击切换）`}
    >
      {icons[theme]}
    </button>
  )
}

function formatTimeLabel(dateObj: dayjs.Dayjs, prevLabel?: string): string {
  const now = dayjs()
  const diffHours = now.diff(dateObj, 'hour')

  if (diffHours < 24) {
    const relative = dateObj.fromNow()
    if (prevLabel === relative) {
      return dateObj.format('HH:mm')
    }
    return relative
  }

  return dateObj.format('MM-DD')
}

const RAIL_COL_WIDTH = 40
const DOT_SIZE = 14
const DOT_BORDER = 3
const TIME_COL_WIDTH = 72

function ChangelogItem({ item, isFirst, prevVersion, prevTimeLabel }: { item: ReleaseEntry; isFirst?: boolean; prevVersion?: string; prevTimeLabel?: string }) {
  const isWeb = item.os === 'web'
  const severity = getVersionSeverity(item.app_version, prevVersion)
  const isForce = item.is_force === 1
  // Which platforms are actually being told to upgrade — a card holds every OS
  // build of one version, and is_force is per build.
  const forcedOn = forcedPlatforms(item).map((os) => platformConfig[os]?.label ?? os)
  const blocks = useMemo(() => noteBlocks(item, viewerOS), [item])
  const contributors = useMemo(() => blockContributors(blocks), [blocks])
  const dotColor = 'var(--timeline-dot-border)'

  const dateObj = dayjs(item.created_at)
  const dateLabel = dateObj.format('YYYY年M月D日 HH:mm')
  const relativeLabel = formatTimeLabel(dateObj, prevTimeLabel)

  const isWebMerged = isWeb && TIME_TAG_PATTERN.test(item.update_desc)
  const stats = useMemo(() => isWebMerged ? blockStats(blocks) : null, [blocks, isWebMerged])

  const severityStyle = getSeverityStyle(severity)
  const forceStyle: React.CSSProperties = isForce ? {
    borderLeft: `4px solid ${colors.state.force.base}`,
    background: colors.state.force.bg,
    borderRadius: radius.md,
    padding: space[4],
  } : {}

  const itemStyle: React.CSSProperties = isForce ? forceStyle : severityStyle

  return (
    <div className="changelog-item" style={{ position: 'relative' }}>
      {!isFirst && <div style={{ borderTop: '1px solid var(--divider-item)', marginLeft: TIME_COL_WIDTH + RAIL_COL_WIDTH }} />}

      <div style={itemStyle}>
        <div style={{ display: 'flex', paddingTop: space[5] }}>
          {/* Left: time */}
          <div style={{
            width: TIME_COL_WIDTH,
            flexShrink: 0,
            paddingTop: 2,
            textAlign: 'right',
            paddingRight: space[3],
          }}>
            <div
              title={dateLabel}
              style={{ fontSize: font.size.sm, color: colors.text.tertiary, lineHeight: '20px' }}
            >
              {relativeLabel}
            </div>
          </div>

          {/* Center: dot on rail */}
          <div style={{
            width: RAIL_COL_WIDTH,
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
            position: 'relative',
          }}>
            <div style={{
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: '50%',
              background: 'var(--bg-page)',
              border: `${DOT_BORDER}px solid ${dotColor}`,
              boxShadow: '0 0 0 3px var(--timeline-dot-glow)',
              position: 'relative',
              zIndex: 2,
              marginTop: 3,
            }} />
          </div>

          {/* Right: content */}
          <div style={{ flex: 1, minWidth: 0, paddingBottom: space[8] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3], flexWrap: 'wrap' }}>
              {!isWebMerged && SEVERITY_TAG_CONFIG[severity] && (
                <span style={{
                  fontSize: font.size.xs,
                  fontWeight: font.weight.bold,
                  color: SEVERITY_TAG_CONFIG[severity]!.color,
                  background: SEVERITY_TAG_CONFIG[severity]!.bg,
                  padding: '2px 8px',
                  borderRadius: radius.pill,
                }}>
                  {SEVERITY_TAG_CONFIG[severity]!.label}
                </span>
              )}
              <span style={{
                fontSize: isWeb
                  ? font.size.md
                  : (severity === 'major' || severity === 'initial') ? font.size.xl : font.size.lg,
                fontWeight: isWeb
                  ? font.weight.semibold
                  : severity === 'patch' || severity === 'unknown' ? font.weight.bold : font.weight.black,
                color: isWeb ? colors.text.secondary : colors.text.primary,
                letterSpacing: '-0.02em',
              }}>
                {isWeb ? `${item.created_at.slice(5, 10)} 更新` : `v${formatVersion(item.app_version)}`}
              </span>
              <EntryBadges entry={item} />
              {isWebMerged && stats && (
                <span style={{ fontSize: font.size.xs, color: colors.text.tertiary }}>
                  {[
                    stats.added > 0 && `${stats.added} 项新增`,
                    stats.fixed > 0 && `${stats.fixed} 项修复`,
                    stats.changed > 0 && `${stats.changed} 项变更`,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
              {isForce && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: font.size.xs,
                  fontWeight: font.weight.bold,
                  color: colors.state.force.text,
                  background: colors.state.force.bg,
                  border: `1px solid color-mix(in srgb, ${colors.state.force.base} 20%, transparent)`,
                  padding: '2px 10px',
                  borderRadius: radius.pill,
                }}>
                  <WarningOutlined />
                  {forcedOn.length > 0 ? `${forcedOn.join('、')} 必须升级` : '必须升级'}
                </span>
              )}
              <ContributorAvatars contributors={contributors} showLabel />
            </div>

            <ReleaseNotes blocks={blocks} />

            {item.builds && <DesktopDownloads builds={item.builds} compact />}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LatestReleaseSpotlight({ item, severity, hideDownloads }: { item: ReleaseEntry; severity: VersionSeverity; hideDownloads?: boolean }) {
  const isWeb = item.os === 'web'
  const dateObj = dayjs(item.created_at)
  const blocks = useMemo(() => noteBlocks(item, viewerOS), [item])
  const stats = useMemo(() => blockStats(blocks), [blocks])
  const contributors = useMemo(() => blockContributors(blocks), [blocks])
  const isWebMerged = isWeb && TIME_TAG_PATTERN.test(item.update_desc)
  const downloadHref = safeDownloadUrl(item.download_url)

  return (
    <div style={{
      background: 'var(--spotlight-bg)',
      border: '1px solid var(--spotlight-border)',
      borderLeftWidth: 4,
      borderLeftColor: 'var(--brand)',
      borderRadius: radius.xl,
      padding: space[6],
      marginBottom: space[6],
      boxShadow: 'var(--spotlight-shadow)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        marginBottom: space[3],
      }}>
        <span style={{
          fontSize: font.size.xs,
          fontWeight: font.weight.bold,
          color: 'var(--brand-text-on-bg)',
          background: 'var(--brand-bg)',
          padding: '3px 8px',
          borderRadius: radius.pill,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          Latest Release
        </span>
        {!isWebMerged && SEVERITY_TAG_CONFIG[severity] && (
          <span style={{
            fontSize: font.size.xs,
            fontWeight: font.weight.bold,
            color: SEVERITY_TAG_CONFIG[severity]!.color,
            background: SEVERITY_TAG_CONFIG[severity]!.bg,
            padding: '3px 8px',
            borderRadius: radius.pill,
          }}>
            {SEVERITY_TAG_CONFIG[severity]!.label}
          </span>
        )}
        <span style={{ fontSize: font.size.sm, color: colors.text.tertiary }}>
          {dateObj.fromNow()} · {dateObj.format('YYYY年M月D日 HH:mm')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[3], flexWrap: 'wrap' }}>
        <span style={{ fontSize: isWeb ? 22 : 28, fontWeight: isWeb ? font.weight.semibold : font.weight.black, color: isWeb ? colors.text.secondary : colors.text.primary, letterSpacing: '-0.03em' }}>
          {isWeb ? `${item.created_at.slice(5, 10)} 更新` : `v${formatVersion(item.app_version)}`}
        </span>
        <EntryBadges entry={item} />
        {isWebMerged && (
          <span style={{ fontSize: font.size.xs, color: colors.text.tertiary }}>
            {[
              stats.added > 0 && `${stats.added} 项新增`,
              stats.fixed > 0 && `${stats.fixed} 项修复`,
              stats.changed > 0 && `${stats.changed} 项变更`,
            ].filter(Boolean).join(' · ')}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <ContributorAvatars contributors={contributors} showLabel />
      </div>

      <div style={{ marginBottom: space[4] }}>
        <ReleaseNotes blocks={blocks} />
      </div>

      {(stats.added > 0 || stats.fixed > 0 || stats.changed > 0 || !hideDownloads) && (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[4],
        paddingTop: space[3],
        borderTop: `1px solid ${colors.surface.border}`,
        flexWrap: 'wrap',
      }}>
        {stats.added > 0 && (
          <span style={{ fontSize: font.size.sm, color: colors.category.added.text, display: 'flex', alignItems: 'center', gap: 4 }}>
            <PlusCircleOutlined style={{ color: colors.category.added.icon }} />
            新增 {stats.added}
          </span>
        )}
        {stats.fixed > 0 && (
          <span style={{ fontSize: font.size.sm, color: colors.category.fixed.text, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ToolOutlined style={{ color: colors.category.fixed.icon }} />
            修复 {stats.fixed}
          </span>
        )}
        {stats.changed > 0 && (
          <span style={{ fontSize: font.size.sm, color: colors.category.changed.text, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ThunderboltOutlined style={{ color: colors.category.changed.icon }} />
            变更 {stats.changed}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {hideDownloads ? null : item.builds ? (
          <DesktopDownloads builds={item.builds} />
        ) : downloadHref ? (
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: font.size.sm,
              fontWeight: font.weight.medium,
              color: 'var(--brand)',
              background: 'transparent',
              padding: '4px 12px',
              borderRadius: radius.sm,
              textDecoration: 'none',
              border: '1px solid var(--brand)',
            }}
          >
            <DownloadOutlined />
            Download
          </a>
        ) : null}
      </div>
      )}
    </div>
  )
}

export default function Changelog() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AppVersion[]>([])
  const [activePlatform, setActivePlatform] = useState('all')
  const { effective } = useTheme()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/v1/common/changelog')
        setData(res.data || [])
      } catch {
        setData([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const filtered = useMemo(() => {
    const raw = activePlatform === 'all'
      ? data
      : activePlatform === 'desktop'
        ? data.filter((v) => desktopPlatforms.has(v.os))
        : data.filter((v) => v.os === activePlatform)
    return groupReleases(raw)
  }, [data, activePlatform])

  // Deliberately from `data`, not `filtered`: switching to the iOS tab should not
  // take the desktop installer away.
  const desktopDownloads = useMemo(() => latestDesktopDownloads(data), [data])

  const latestItem = filtered[0] ?? null
  const restItems = filtered.slice(1)

  // When the newest release is the one the band above is already offering, the card
  // would repeat the same two buttons half a screen apart. The handheld case needs
  // no exception here: DesktopDownloads renders nothing there either way.
  const spotlightOfferedAbove = useMemo(
    () => (latestItem ? offeredAbove(latestItem, desktopDownloads) : false),
    [latestItem, desktopDownloads],
  )

  const prevVersionMap = useMemo(() => {
    const map = new Map<number, string>()
    const lastSeenByPlatform: Record<string, string> = {}
    for (let i = filtered.length - 1; i >= 0; i--) {
      const item = filtered[i]
      // Desktop shares one version history — its builds ship together — while every
      // other platform keeps its own, so severity never diffs across platforms.
      const platform = desktopPlatforms.has(item.os) ? 'desktop' : item.os
      if (lastSeenByPlatform[platform] !== undefined) {
        map.set(i, lastSeenByPlatform[platform])
      }
      lastSeenByPlatform[platform] = item.app_version
    }
    return map
  }, [filtered])

  const timeLabelMap = useMemo(() => {
    const map = new Map<number, string>()
    for (let i = 0; i < restItems.length; i++) {
      const dateObj = dayjs(restItems[i].created_at)
      const now = dayjs()
      const diffHours = now.diff(dateObj, 'hour')
      if (diffHours < 24) {
        map.set(i, dateObj.fromNow())
      } else {
        map.set(i, dateObj.format('MM-DD'))
      }
    }
    return map
  }, [restItems])

  return (
    <ConfigProvider
      key={effective}
      theme={{
        algorithm: effective === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: effective === 'dark' ? '#818cf8' : '#6366f1',
        },
        components: {
          Tabs: {
            itemColor: 'var(--tabs-ink-inactive)',
            itemHoverColor: 'var(--tabs-ink-hover)',
            itemSelectedColor: 'var(--tabs-ink-active)',
            inkBarColor: 'var(--tabs-indicator)',
            titleFontSize: 14,
            horizontalItemPadding: '12px 16px',
          },
        },
      }}
    >
      <div style={{ minHeight: '100vh', background: colors.surface.background }}>
        <style>{css}</style>

        <header
          style={{
            background: 'var(--header-bg)',
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${colors.surface.border}`,
            padding: `0 ${space[6]}px`,
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: space[3],
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <a
            href="https://api.example.com"
            style={{ display: 'flex', alignItems: 'center', gap: space[3], textDecoration: 'none' }}
          >
            <img src="/favicon.ico" alt="Octo" style={{ width: 32, height: 32, borderRadius: radius.md }} />
            <span style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.text.primary }}>Octo</span>
          </a>
          <span style={{ color: colors.text.tertiary, fontSize: font.size.base, marginLeft: space[1] }}>/ What's New</span>
          <ThemeToggle />
        </header>

        <main style={{ width: '100%', maxWidth: 1040, margin: '0 auto', padding: `${space[8]}px ${space[6]}px ${space[8]}px`, boxSizing: 'border-box' }}>

          {!loading && <DesktopDownloadBar downloads={desktopDownloads} />}

          <div style={{ marginBottom: space[6] }}>
            <h1 style={{
              fontSize: font.size['2xl'],
              fontWeight: font.weight.black,
              color: colors.text.primary,
              marginBottom: space[1],
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}>
              What's New
            </h1>
            <p style={{ color: colors.text.secondary, fontSize: font.size.base, lineHeight: 1.6, margin: 0 }}>
              Keep up with the latest releases, improvements, and fixes.
            </p>
          </div>

          {!loading && latestItem && (
            <LatestReleaseSpotlight
              item={latestItem}
              severity={getVersionSeverity(latestItem.app_version, prevVersionMap.get(0))}
              hideDownloads={spotlightOfferedAbove}
            />
          )}

          {!loading && data.length > 0 && (
            <div style={{ marginBottom: space[6] }}>
              <AnalyticsPanel summary={`${data.length} releases`}>
                <Heatmap data={data} />
              </AnalyticsPanel>
            </div>
          )}

          <Tabs
            className="changelog-tabs"
            activeKey={activePlatform}
            onChange={setActivePlatform}
            items={tabItems.map((t) => {
              const iconColor = t.color ? (effective === 'dark' ? t.colorDark : t.color) : undefined
              return {
                key: t.key,
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={iconColor ? { color: iconColor } : undefined}>{t.icon}</span>
                    {t.label}
                  </span>
                ),
              }
            })}
            style={{ marginBottom: space[4] }}
          />

          {loading ? (
            <div style={{ textAlign: 'center', padding: 80 }}>
              <Spin size="large" />
            </div>
          ) : filtered.length === 0 ? (
            <Empty description="No releases found" style={{ padding: 80 }} />
          ) : (
            <div>
              {restItems.length > 0 && (
                <div style={{ fontSize: font.size.sm, color: 'var(--text-section-label)', fontWeight: font.weight.medium, marginBottom: space[4] }}>
                  更早的发布
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute',
                  left: TIME_COL_WIDTH + RAIL_COL_WIDTH / 2 - 1,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: 'var(--timeline-rail)',
                  borderRadius: 1,
                }} />
                {restItems.map((item, index) => {
                  const filteredIndex = index + 1
                  return (
                    <ChangelogItem
                      key={`${item.os}-${item.app_version}-${item.created_at}`}
                      item={item}
                      isFirst={index === 0}
                      prevVersion={prevVersionMap.get(filteredIndex)}
                      prevTimeLabel={index > 0 ? timeLabelMap.get(index - 1) : undefined}
                    />
                  )
                })}
              </div>
              <div style={{ borderTop: `1px solid ${colors.surface.border}`, marginBottom: space[4] }} />
              <div style={{ textAlign: 'center', color: colors.text.muted, fontSize: font.size.sm, padding: `${space[2]}px 0 ${space[4]}px` }}>
                — 已经到底了 —
              </div>
            </div>
          )}
        </main>

        <footer style={{ textAlign: 'center', padding: `${space[8]}px ${space[6]}px`, color: colors.text.tertiary, fontSize: font.size.sm }}>
          Octo &copy; {new Date().getFullYear()}
          <span style={{ display: 'none' }}>{__BUILD_TIME__}</span>
        </footer>
      </div>
    </ConfigProvider>
  )
}
