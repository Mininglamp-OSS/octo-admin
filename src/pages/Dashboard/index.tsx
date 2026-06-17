import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Input,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { SorterResult } from 'antd/es/table/interface'
import { useTranslation } from 'react-i18next'
import {
  AppstoreOutlined,
  CommentOutlined,
  MessageOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  SyncOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  getDashboardOverview,
  getDashboardTrend,
  listDashboardChannels,
  listDashboardDirectChats,
  listDashboardSpaces,
  runDashboardEtl,
  type DashboardActiveStatus,
  type DashboardChannelItem,
  type DashboardChannelSortBy,
  type DashboardDirectChatItem,
  type DashboardDirectChatSortBy,
  type DashboardOrder,
  type DashboardOverview,
  type DashboardSpaceItem,
  type DashboardSpaceSortBy,
  type DashboardTrendGranularity,
  type DashboardTrendItem,
} from '../../api/dashboard'
import { ApiError } from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'

const { RangePicker } = DatePicker
const { Text } = Typography

const DATE_FORMAT = 'YYYY-MM-DD'
const MAIN_LIST_PAGE_SIZE = 10
const DRAWER_PAGE_SIZE = 20
const MAIN_LIST_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DRAWER_PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

const EMPTY_OVERVIEW: DashboardOverview = {
  space_total: 0,
  group_total: 0,
  human_member_total: 0,
  agent_total: 0,
  active_groups: 0,
  active_human_members: 0,
  active_agent_members: 0,
  human_msg_count: 0,
  agent_msg_count: 0,
  private_active_count: 0,
  message_composition: [],
}

const SPACE_SORT_VALUES: DashboardSpaceSortBy[] = [
  'last_active',
  'total_msg',
  'group_total',
  'human_member_total',
]

const CHANNEL_SORT_VALUES: DashboardChannelSortBy[] = [
  'last_active',
  'human_msg_count',
  'agent_msg_count',
  'total_msg',
  'member_count',
]

const DIRECT_SORT_VALUES: DashboardDirectChatSortBy[] = ['last_active', 'msg_count']
// The dashboard API schema defines conv_type as fixed values 1-4.
const CONV_TYPE_VALUES = [1, 2, 3, 4] as const
const DASHBOARD_SECTION_IDS = ['dashboard-kpis', 'dashboard-charts', 'dashboard-spaces', 'dashboard-direct'] as const

const numberFormat = new Intl.NumberFormat()

type ChartTooltipLine = {
  label: string
  value: ReactNode
}

type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number]
type DashboardTrendDisplayMode = 'absolute' | 'share'

function dashboardErrorKey(error: unknown) {
  if (!(error instanceof ApiError)) return 'error.fallback'
  const code = error.code?.toLowerCase() || ''
  if (code.includes('not_found') || error.status === 404) return 'error.notFound'
  if (code.includes('forbidden') || code.includes('unauthorized') || error.status === 403) return 'error.forbidden'
  if (
    code.includes('request_invalid') ||
    code.includes('invalid_request') ||
    code.includes('bad_request') ||
    error.status === 400
  ) return 'error.requestInvalid'
  if (code.includes('query_failed')) return 'error.queryFailed'
  if (code.includes('etl_already_running') || error.status === 409) return 'error.etlAlreadyRunning'
  if (code.includes('etl_trigger_failed')) return 'error.etlTriggerFailed'
  return 'error.fallback'
}

function useLazySection<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled) return
    if (ready) return
    const node = ref.current
    if (!node) return

    if (!('IntersectionObserver' in window)) {
      setReady(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReady(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -96px 0px', threshold: 0.01 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, ready])

  return [ref, ready] as const
}

function defaultDateRange(): [Dayjs, Dayjs] {
  return [dayjs().subtract(29, 'day'), dayjs()]
}

function formatNumber(value?: number | null) {
  return numberFormat.format(value ?? 0)
}

function formatPercent(active: number, total: number) {
  if (!total) return '0%'
  return `${((active / total) * 100).toFixed(1)}%`
}

function formatTime(value?: number | null) {
  if (!value) return '-'
  return dayjs.unix(value).format('YYYY-MM-DD HH:mm')
}

function totalMessages(record: Pick<DashboardSpaceItem | DashboardChannelItem, 'human_msg_count' | 'agent_msg_count'>) {
  return (record.human_msg_count || 0) + (record.agent_msg_count || 0)
}

function truncateLabel(label: string, max = 18) {
  if (label.length <= max) return label
  return `${label.slice(0, max)}...`
}

// 消息活跃度的明度梯度(全屏标注稿 §03):用 √ 归一化压缩低值,映射到字号(16→26px)
// 与明度(opacity 0.5→1 作用于主文字色)。不用色相,避免"多=好/少=坏"误导。
// 用 opacity 而非硬编码 rgb,以便暗色模式自动适配(深墨字在暗背景不可见)。
function channelMsgTone(total: number, max: number): { fontSize: number; opacity: number } {
  if (max <= 0) return { fontSize: 16, opacity: 0.55 }
  const t = Math.sqrt(total / max)
  return { fontSize: 16 + Math.round(t * 10), opacity: 0.5 + 0.5 * t }
}

// 人/Bot 分段热力条(全屏标注稿 §03):总宽 = max(5, 占全量比),内部按人/Bot 切分。
function channelHeatWidths(total: number, human: number, agent: number, max: number) {
  if (max <= 0 || total <= 0) return { human: 0, bot: 0 }
  const span = Math.max(5, Math.round((total / max) * 100))
  return {
    human: (human / total) * span,
    bot: (agent / total) * span,
  }
}

// 最后活跃的相对时间(今天/昨天/N 天前);30 天以上不显示,绝对时间已足够。
function relativeTimeLabel(
  unix: number | null | undefined,
  translate: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!unix) return ''
  const diffDays = dayjs().startOf('day').diff(dayjs.unix(unix).startOf('day'), 'day')
  if (diffDays <= 0) return translate('channels.rel.today')
  if (diffDays === 1) return translate('channels.rel.yesterday')
  if (diffDays < 30) return translate('channels.rel.daysAgo', { n: diffDays })
  return ''
}

function orderToAntd(order: DashboardOrder) {
  return order === 'asc' ? 'ascend' : 'descend'
}

function antOrder(order?: string): DashboardOrder {
  return order === 'ascend' ? 'asc' : 'desc'
}

function sorterKey<T extends string>(sorter: SorterResult<unknown>, fallback: T) {
  if (typeof sorter.columnKey === 'string') return sorter.columnKey
  if (typeof sorter.field === 'string') return sorter.field
  return fallback
}

function isSpaceSortBy(value: string): value is DashboardSpaceSortBy {
  return SPACE_SORT_VALUES.includes(value as DashboardSpaceSortBy)
}

function isChannelSortBy(value: string): value is DashboardChannelSortBy {
  return CHANNEL_SORT_VALUES.includes(value as DashboardChannelSortBy)
}

function isDirectSortBy(value: string): value is DashboardDirectChatSortBy {
  return DIRECT_SORT_VALUES.includes(value as DashboardDirectChatSortBy)
}

function MetricCard({
  title,
  value,
  icon,
  meta,
  detail,
  loading,
}: {
  title: string
  value: number
  icon: ReactNode
  meta: ReactNode
  detail?: ReactNode
  loading: boolean
}) {
  return (
    <Card className="dashboard-metric-card" styles={{ body: { padding: 20 } }}>
      <div className="dashboard-metric-heading">
        <span>{title}</span>
        <span className="dashboard-metric-icon">{icon}</span>
      </div>
      <Statistic
        value={value}
        formatter={() => (loading ? '-' : formatNumber(value))}
      />
      {detail ? <div className="dashboard-metric-detail">{loading ? '-' : detail}</div> : null}
      <div className="dashboard-metric-meta">{loading ? '-' : meta}</div>
    </Card>
  )
}

function EmptyChart({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="empty-card dashboard-chart-empty">
      <div className="empty-title">{title}</div>
      <div className="empty-hint-text">{hint}</div>
    </div>
  )
}

function ChartTooltipContent({ title, lines }: { title: string; lines: ChartTooltipLine[] }) {
  return (
    <div className="dashboard-chart-tooltip">
      <strong>{title}</strong>
      {lines.map((line) => (
        <span key={line.label}>
          <em>{line.label}</em>
          <b>{line.value}</b>
        </span>
      ))}
    </div>
  )
}

function segmentedTooltipLines({
  totalLabel,
  primaryLabel,
  primary,
  secondaryLabel,
  secondary,
  segmentTotal,
  shareLabel,
}: {
  totalLabel: string
  primaryLabel?: string
  primary: number
  secondaryLabel?: string
  secondary: number
  segmentTotal: number
  shareLabel: string
}) {
  const lines: ChartTooltipLine[] = [{ label: totalLabel, value: formatNumber(primary + secondary) }]
  if (primaryLabel && secondaryLabel) {
    lines.push(
      { label: primaryLabel, value: formatNumber(primary) },
      { label: `${primaryLabel} ${shareLabel}`, value: formatPercent(primary, segmentTotal) },
      { label: secondaryLabel, value: formatNumber(secondary) },
      { label: `${secondaryLabel} ${shareLabel}`, value: formatPercent(secondary, segmentTotal) },
    )
  }
  return lines
}

function MessageSplitCell({
  human,
  agent,
  humanLabel,
  agentLabel,
}: {
  human: number
  agent: number
  humanLabel: string
  agentLabel: string
}) {
  const total = human + agent
  const humanPercent = total > 0 ? (human / total) * 100 : 0
  const agentPercent = total > 0 ? (agent / total) * 100 : 0

  return (
    <div className="dashboard-message-split">
      <div className="dashboard-message-split-head">
        <strong>{formatNumber(total)}</strong>
        <span>{humanLabel} {formatNumber(human)} · {agentLabel} {formatNumber(agent)}</span>
      </div>
      <div className="dashboard-message-split-track" aria-label={`${humanLabel} ${formatPercent(human, total)}, ${agentLabel} ${formatPercent(agent, total)}`}>
        <span className="dashboard-message-split-human" style={{ width: `${humanPercent}%`, minWidth: human > 0 ? 4 : 0 }} />
        <span className="dashboard-message-split-agent" style={{ width: `${agentPercent}%`, minWidth: agent > 0 ? 4 : 0 }} />
      </div>
    </div>
  )
}

function DonutChart({
  title,
  centerLabel,
  emptyHint,
  items,
  ariaLabel,
  valueLabel,
  shareLabel,
  compact = false,
}: {
  title: string
  centerLabel: string
  emptyHint: string
  items: { label: string; value: number; color: string }[]
  ariaLabel: string
  valueLabel: string
  shareLabel: string
  compact?: boolean
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) return <EmptyChart title={title} hint={emptyHint} />

  const size = compact ? 152 : 168
  const center = size / 2
  const radius = compact ? 54 : 60
  const strokeWidth = compact ? 18 : 20
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className={`dashboard-chart-body${compact ? ' compact' : ''}`}>
      <div className="dashboard-donut-wrap">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
          <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--a-bg-muted)" strokeWidth={strokeWidth} />
          {items.map((item, index) => {
            const length = (item.value / total) * circumference
            const percent = formatPercent(item.value, total)
            const tooltip = (
              <ChartTooltipContent
                title={item.label}
                lines={[
                  { label: valueLabel, value: formatNumber(item.value) },
                  { label: shareLabel, value: percent },
                ]}
              />
            )
            const segment = (
              <Tooltip key={`${item.label}-${index}`} title={tooltip} mouseEnterDelay={0.12}>
                <g className="dashboard-donut-segment" tabIndex={0} aria-label={`${item.label}: ${formatNumber(item.value)} · ${percent}`}>
                  <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                    transform={`rotate(-90 ${center} ${center})`}
                  />
                </g>
              </Tooltip>
            )
            offset += length
            return segment
          })}
        </svg>
        <div className="dashboard-donut-center">
          <strong>{formatNumber(total)}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div className="dashboard-chart-legend">
        {items.map((item, index) => (
          <Tooltip
            key={`${item.label}-${index}`}
            title={
              <ChartTooltipContent
                title={item.label}
                lines={[
                  { label: valueLabel, value: formatNumber(item.value) },
                  { label: shareLabel, value: formatPercent(item.value, total) },
                ]}
              />
            }
            mouseEnterDelay={0.12}
          >
            <div className="dashboard-chart-legend-item" tabIndex={0}>
              <span style={{ background: item.color }} />
              <div>
                <strong>{item.label}</strong>
                <em>{formatNumber(item.value)} · {formatPercent(item.value, total)}</em>
              </div>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

function HorizontalBars({
  title,
  hint,
  primaryLabel,
  secondaryLabel,
  rows,
  ariaLabel,
  totalLabel,
  shareLabel,
  scale = 'linear',
  scaleLabel,
}: {
  title: string
  hint: string
  primaryLabel?: string
  secondaryLabel?: string
  rows: { label: string; value: number; primary?: number; secondary?: number }[]
  ariaLabel: string
  totalLabel: string
  shareLabel: string
  scale?: 'linear' | 'log'
  scaleLabel?: string
}) {
  const max = Math.max(...rows.map((row) => row.value), 0)
  if (max <= 0) return <EmptyChart title={title} hint={hint} />
  const scaledWidth = (value: number) => {
    if (scale === 'log') return (Math.log1p(value) / Math.log1p(max)) * 100
    return (value / max) * 100
  }

  return (
    <div className="dashboard-bars" role="img" aria-label={ariaLabel}>
      {primaryLabel && secondaryLabel ? (
        <div className="dashboard-bar-legend">
          <span className="dashboard-bar-legend-primary">{primaryLabel}</span>
          <span className="dashboard-bar-legend-secondary">{secondaryLabel}</span>
          {scaleLabel ? <em className="dashboard-bar-scale">{scaleLabel}</em> : null}
        </div>
      ) : null}
      {rows.map((row, index) => {
        const secondary = row.secondary ?? 0
        const primary = row.primary ?? (row.secondary !== undefined ? Math.max(row.value - secondary, 0) : row.value)
        const segmentTotal = Math.max(row.value, primary + secondary, 1)
        const tooltipLines = row.secondary !== undefined
          ? segmentedTooltipLines({
            totalLabel,
            primaryLabel,
            primary,
            secondaryLabel,
            secondary,
            segmentTotal,
            shareLabel,
          })
          : [{ label: totalLabel, value: formatNumber(row.value) }]

        return (
          <Tooltip
            key={`${row.label}-${index}`}
            title={<ChartTooltipContent title={row.label} lines={tooltipLines} />}
            mouseEnterDelay={0.12}
          >
            <div className="dashboard-bar-row" tabIndex={0} aria-label={`${row.label}: ${formatNumber(row.value)}`}>
              <div className="dashboard-bar-label">
                <span>{truncateLabel(row.label)}</span>
                <strong>{formatNumber(row.value)}</strong>
              </div>
              <div className="dashboard-bar-track">
                <span className="dashboard-bar-fill" style={{ width: `${Math.max(4, scaledWidth(row.value))}%` }}>
                  <span
                    className="dashboard-bar-primary"
                    style={{
                      width: row.secondary !== undefined && row.value > 0
                        ? `${Math.max(0, Math.min(100, (primary / segmentTotal) * 100))}%`
                        : '100%',
                    }}
                  />
                  {row.secondary !== undefined && row.value > 0 ? (
                    <span
                      className="dashboard-bar-secondary"
                      style={{ width: `${Math.max(0, Math.min(100, (secondary / segmentTotal) * 100))}%` }}
                    />
                  ) : null}
                </span>
              </div>
            </div>
          </Tooltip>
        )
      })}
    </div>
  )
}

function buildTrendPath(points: { x: number; y: number }[]) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ')
}

function TrendLineChart({
  rows,
  granularity,
  displayMode,
  loading,
  emptyTitle,
  emptyHint,
  humanLabel,
  agentLabel,
  loadingHint,
  ariaLabel,
  totalLabel,
  agentShareLabel,
  agentRatioLabel,
}: {
  rows: DashboardTrendItem[]
  granularity: DashboardTrendGranularity
  displayMode: DashboardTrendDisplayMode
  loading: boolean
  emptyTitle: string
  emptyHint: string
  humanLabel: string
  agentLabel: string
  loadingHint: string
  ariaLabel: string
  totalLabel: string
  agentShareLabel: string
  agentRatioLabel: string
}) {
  const valueForHuman = (row: DashboardTrendItem) => {
    const total = row.total_msg_count || 0
    return displayMode === 'share' ? (total > 0 ? ((row.human_msg_count || 0) / total) * 100 : 0) : row.human_msg_count || 0
  }
  const valueForAgent = (row: DashboardTrendItem) => {
    const total = row.total_msg_count || 0
    return displayMode === 'share' ? (total > 0 ? ((row.agent_msg_count || 0) / total) * 100 : 0) : row.agent_msg_count || 0
  }
  const maxValue = displayMode === 'share'
    ? 100
    : Math.max(
      ...rows.map((row) => Math.max(row.total_msg_count || 0, row.human_msg_count || 0, row.agent_msg_count || 0)),
      0,
    )
  const hasTrendData = rows.some((row) =>
    (row.total_msg_count || 0) > 0 || (row.human_msg_count || 0) > 0 || (row.agent_msg_count || 0) > 0,
  )

  if (!hasTrendData || maxValue <= 0) {
    return <EmptyChart title={emptyTitle} hint={loading ? loadingHint : emptyHint} />
  }

  const width = 720
  const height = 220
  const padding = { top: 18, right: 16, bottom: 34, left: 44 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const bottom = padding.top + plotHeight
  const xFor = (index: number) => padding.left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth)
  const yFor = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight
  const pointsFor = (selector: (row: DashboardTrendItem) => number) =>
    rows.map((row, index) => ({ x: xFor(index), y: yFor(selector(row) || 0) }))

  const totalPoints = displayMode === 'absolute' ? pointsFor((row) => row.total_msg_count) : []
  const humanPoints = pointsFor(valueForHuman)
  const agentPoints = pointsFor(valueForAgent)
  const totalPath = displayMode === 'absolute' ? buildTrendPath(totalPoints) : ''
  const humanPath = buildTrendPath(humanPoints)
  const agentPath = buildTrendPath(agentPoints)
  const areaPath = displayMode === 'absolute'
    ? `${totalPath} L${totalPoints[totalPoints.length - 1].x.toFixed(1)},${bottom} L${totalPoints[0].x.toFixed(1)},${bottom} Z`
    : ''
  const humanTotal = rows.reduce((sum, row) => sum + (row.human_msg_count || 0), 0)
  const agentTotal = rows.reduce((sum, row) => sum + (row.agent_msg_count || 0), 0)
  const middleIndex = Math.floor((rows.length - 1) / 2)
  const labelIndexes = Array.from(new Set([0, middleIndex, rows.length - 1])).filter((index) => index >= 0)
  const formatBucket = (row: DashboardTrendItem) => {
    if (granularity === 'week') {
      const startLabel = dayjs(row.start_date || row.bucket).format('MM-DD')
      const endLabel = dayjs(row.end_date || row.start_date || row.bucket).format('MM-DD')
      return startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`
    }
    return dayjs(row.bucket).format('MM-DD')
  }
  const trendHotspot = (index: number) => {
    if (rows.length <= 1) return { x: padding.left, width: plotWidth }
    const step = plotWidth / (rows.length - 1)
    if (index === 0) return { x: padding.left, width: step / 2 }
    if (index === rows.length - 1) return { x: xFor(index) - step / 2, width: step / 2 }
    return { x: xFor(index) - step / 2, width: step }
  }

  return (
    <div className="dashboard-trend-chart">
      <svg className="dashboard-trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {[0, 0.5, 1].map((ratio) => {
          const y = padding.top + plotHeight * ratio
          const value = Math.round(maxValue * (1 - ratio))
          return (
            <g key={ratio}>
              <line className="dashboard-trend-grid" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />
              <text className="dashboard-trend-axis" x={padding.left - 10} y={y + 4} textAnchor="end">
                {displayMode === 'share' ? `${value}%` : formatNumber(value)}
              </text>
            </g>
          )
        })}
        {displayMode === 'absolute' ? <path className="dashboard-trend-area" d={areaPath} /> : null}
        <path className="dashboard-trend-line human" d={humanPath} />
        <path className="dashboard-trend-line agent" d={agentPath} />
        {rows.map((row, index) => {
          const x = xFor(index)
          const hotspot = trendHotspot(index)
          const total = row.total_msg_count || 0
          const human = row.human_msg_count || 0
          const agent = row.agent_msg_count || 0
          const bucketLabel = formatBucket(row)
          const agentRatio = human > 0 ? `${(agent / human).toFixed(2)}x` : '-'
          return (
            <Tooltip
              key={`${row.bucket}-${index}`}
              title={
                <ChartTooltipContent
                  title={bucketLabel}
                  lines={[
                    { label: totalLabel, value: formatNumber(total) },
                    { label: humanLabel, value: formatNumber(human) },
                    { label: agentLabel, value: formatNumber(agent) },
                    { label: agentShareLabel, value: formatPercent(agent, total) },
                    { label: agentRatioLabel, value: agentRatio },
                  ]}
                />
              }
              mouseEnterDelay={0.12}
            >
              <g
                className="dashboard-trend-point"
                tabIndex={0}
                aria-label={`${bucketLabel}: ${totalLabel} ${formatNumber(total)}, ${humanLabel} ${formatNumber(human)}, ${agentLabel} ${formatNumber(agent)}`}
              >
                <line className="dashboard-trend-hover-line" x1={x} y1={padding.top} x2={x} y2={bottom} />
                <circle className="dashboard-trend-marker human" cx={x} cy={yFor(valueForHuman(row))} r="4" />
                <circle className="dashboard-trend-marker agent" cx={x} cy={yFor(valueForAgent(row))} r="4" />
                <rect className="dashboard-trend-hotspot" x={hotspot.x} y={padding.top} width={hotspot.width} height={plotHeight} />
              </g>
            </Tooltip>
          )
        })}
        {labelIndexes.map((index) => (
          <text key={index} className="dashboard-trend-axis" x={xFor(index)} y={height - 8} textAnchor="middle">
            {formatBucket(rows[index])}
          </text>
        ))}
      </svg>
      <div className="dashboard-trend-legend">
        <span className="dashboard-trend-legend-human">{humanLabel} · {formatNumber(humanTotal)}</span>
        <span className="dashboard-trend-legend-agent">{agentLabel} · {formatNumber(agentTotal)}</span>
      </div>
    </div>
  )
}

function LazyTablePlaceholder({ title, hint }: { title: string; hint: string }) {
  return (
    <Card className="dashboard-lazy-card">
      <div className="dashboard-lazy-copy">
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
      <Skeleton active paragraph={{ rows: 4 }} title={false} />
    </Card>
  )
}

export default function Dashboard() {
  const { t } = useTranslation(['dashboard', 'common'])
  const canRunEtl = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'dashboard.trigger'),
  )
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(defaultDateRange)
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  // 最新已选 id 的引用:fetchSpaceOptions 替换下拉选项时,保留已选但不在本次结果里的项,
  // 避免多选标签丢失 label。
  const selectedSpaceIdsRef = useRef(selectedSpaceIds)
  selectedSpaceIdsRef.current = selectedSpaceIds
  const [spaceOptions, setSpaceOptions] = useState<DashboardSpaceItem[]>([])
  const [spaceOptionsLoading, setSpaceOptionsLoading] = useState(false)
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const [spaceSearch, setSpaceSearch] = useState('')
  const [spaceKeyword, setSpaceKeyword] = useState('')
  const [spaceActive, setSpaceActive] = useState<DashboardActiveStatus>('all')
  const [spacePage, setSpacePage] = useState(1)
  const [spacePageSize, setSpacePageSize] = useState(MAIN_LIST_PAGE_SIZE)
  const [spaceSortBy, setSpaceSortBy] = useState<DashboardSpaceSortBy>('last_active')
  const [spaceOrder, setSpaceOrder] = useState<DashboardOrder>('desc')
  const [spaces, setSpaces] = useState<DashboardSpaceItem[]>([])
  const [spacesTotal, setSpacesTotal] = useState(0)
  const [spacesLoading, setSpacesLoading] = useState(false)
  const [spacesLoadedOnce, setSpacesLoadedOnce] = useState(false)
  const [chartSpaces, setChartSpaces] = useState<DashboardSpaceItem[]>([])
  const [chartSpacesLoading, setChartSpacesLoading] = useState(false)
  const [trendGranularity, setTrendGranularity] = useState<DashboardTrendGranularity>('day')
  const [trendDisplayMode, setTrendDisplayMode] = useState<DashboardTrendDisplayMode>('absolute')
  const [trendRows, setTrendRows] = useState<DashboardTrendItem[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendUnavailable, setTrendUnavailable] = useState(false)
  const [activeSection, setActiveSection] = useState<DashboardSectionId>('dashboard-kpis')

  const [directPage, setDirectPage] = useState(1)
  const [directPageSize, setDirectPageSize] = useState(MAIN_LIST_PAGE_SIZE)
  const [directSortBy, setDirectSortBy] = useState<DashboardDirectChatSortBy>('last_active')
  const [directOrder, setDirectOrder] = useState<DashboardOrder>('desc')
  const [directChats, setDirectChats] = useState<DashboardDirectChatItem[]>([])
  const [directTotal, setDirectTotal] = useState(0)
  const [directLoading, setDirectLoading] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerSpace, setDrawerSpace] = useState<DashboardSpaceItem | null>(null)
  const [channelActive, setChannelActive] = useState<DashboardActiveStatus>('all')
  const [channelPage, setChannelPage] = useState(1)
  const [channelPageSize, setChannelPageSize] = useState(DRAWER_PAGE_SIZE)
  const [channelSortBy, setChannelSortBy] = useState<DashboardChannelSortBy>('last_active')
  const [channelOrder, setChannelOrder] = useState<DashboardOrder>('desc')
  const [channels, setChannels] = useState<DashboardChannelItem[]>([])
  const [channelsTotal, setChannelsTotal] = useState(0)
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [etlLoading, setEtlLoading] = useState(false)

  const overviewSeq = useRef(0)
  const spaceOptionsSeq = useRef(0)
  const spacesSeq = useRef(0)
  const chartSpacesSeq = useRef(0)
  const trendSeq = useRef(0)
  const directSeq = useRef(0)
  const channelsSeq = useRef(0)
  const spaceOptionsSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [spacesSectionRef, spacesSectionReady] = useLazySection<HTMLDivElement>()
  // Direct chats sit below Spaces, so attach its observer after the Spaces section has loaded once.
  const [directSectionRef, directSectionReady] = useLazySection<HTMLDivElement>(spacesLoadedOnce)

  const rangeParams = useMemo(
    () => ({
      start_date: dateRange[0].format(DATE_FORMAT),
      end_date: dateRange[1].format(DATE_FORMAT),
    }),
    [dateRange],
  )

  const rangeLabel = useMemo(
    () => `${rangeParams.start_date} - ${rangeParams.end_date}`,
    [rangeParams.end_date, rangeParams.start_date],
  )

  const currentOverview = overview ?? EMPTY_OVERVIEW
  const dashboardScopeLabel = selectedSpaceIds.length > 0
    ? t('kpi.scope.filtered', { count: selectedSpaceIds.length })
    : t('kpi.scope.global')
  const metricMeta = t('kpi.meta.scopeRange', { scope: dashboardScopeLabel, range: rangeLabel })
  const privateMetricMeta = selectedSpaceIds.length > 0
    ? t('kpi.meta.scopeRange', { scope: t('kpi.scope.globalPrivate'), range: t('kpi.meta.privateFiltered') })
    : t('kpi.meta.scopeRange', { scope: t('kpi.scope.globalPrivate'), range: rangeLabel })
  const clearSpaceOptionsSearchTimer = useCallback(() => {
    if (spaceOptionsSearchTimer.current) {
      clearTimeout(spaceOptionsSearchTimer.current)
      spaceOptionsSearchTimer.current = null
    }
  }, [])
  const dashboardErrorMessage = useCallback(
    (error: unknown) => {
      const fallback = error instanceof Error ? error.message : t('error.fallback')
      return t(dashboardErrorKey(error), { defaultValue: fallback })
    },
    [t],
  )

  const fetchSpaceOptions = useCallback(
    async (name = '') => {
      const seq = ++spaceOptionsSeq.current
      setSpaceOptionsLoading(true)
      try {
        const res = await listDashboardSpaces({
          ...rangeParams,
          name: name.trim() || undefined,
          page_index: 1,
          page_size: 20,
          active_status: 'all',
          sort_by: 'last_active',
          order: 'desc',
        })
        if (seq === spaceOptionsSeq.current) {
          // 搜索/初始结果直接替换下拉选项(而非累积合并),避免被全量列表污染;
          // 仅保留"已选中但不在本次结果里"的项,防止多选标签丢失 label。
          const next = res.list || []
          const nextIds = new Set(next.map((s) => s.space_id))
          setSpaceOptions((prev) => [
            ...prev.filter(
              (s) => selectedSpaceIdsRef.current.includes(s.space_id) && !nextIds.has(s.space_id),
            ),
            ...next,
          ])
        }
      } catch (error) {
        if (seq === spaceOptionsSeq.current) message.error(dashboardErrorMessage(error))
      } finally {
        if (seq === spaceOptionsSeq.current) setSpaceOptionsLoading(false)
      }
    },
    [dashboardErrorMessage, rangeParams],
  )

  const fetchOverview = useCallback(async () => {
    const seq = ++overviewSeq.current
    setOverviewLoading(true)
    try {
      const data = await getDashboardOverview({
        ...rangeParams,
        space_ids: selectedSpaceIds,
      })
      if (seq === overviewSeq.current) setOverview(data)
    } catch (error) {
      if (seq === overviewSeq.current) message.error(dashboardErrorMessage(error))
    } finally {
      if (seq === overviewSeq.current) setOverviewLoading(false)
    }
  }, [dashboardErrorMessage, rangeParams, selectedSpaceIds])

  const fetchSpaces = useCallback(async () => {
    const seq = ++spacesSeq.current
    setSpacesLoading(true)
    try {
      const res = await listDashboardSpaces({
        ...rangeParams,
        name: spaceKeyword || undefined,
        active_status: spaceActive,
        sort_by: spaceSortBy,
        order: spaceOrder,
        page_index: spacePage,
        page_size: spacePageSize,
      })
      if (seq !== spacesSeq.current) return
      setSpaces(res.list || [])
      setSpacesTotal(res.count || 0)
    } catch (error) {
      if (seq === spacesSeq.current) message.error(dashboardErrorMessage(error))
    } finally {
      if (seq === spacesSeq.current) {
        setSpacesLoading(false)
        setSpacesLoadedOnce(true)
      }
    }
  }, [
    dashboardErrorMessage,
    rangeParams,
    spaceActive,
    spaceKeyword,
    spaceOrder,
    spacePage,
    spacePageSize,
    spaceSortBy,
  ])

  const fetchChartSpaces = useCallback(async () => {
    const seq = ++chartSpacesSeq.current
    setChartSpacesLoading(true)
    try {
      const res = await listDashboardSpaces({
        ...rangeParams,
        active_status: 'all',
        sort_by: 'total_msg',
        order: 'desc',
        page_index: 1,
        page_size: selectedSpaceIds.length > 0 ? 200 : 6,
      })
      if (seq !== chartSpacesSeq.current) return
      setChartSpaces(res.list || [])
    } catch (error) {
      if (seq === chartSpacesSeq.current) message.error(dashboardErrorMessage(error))
    } finally {
      if (seq === chartSpacesSeq.current) setChartSpacesLoading(false)
    }
  }, [dashboardErrorMessage, rangeParams, selectedSpaceIds])

  const fetchTrend = useCallback(async () => {
    const seq = ++trendSeq.current
    setTrendLoading(true)
    try {
      const res = await getDashboardTrend({
        ...rangeParams,
        space_ids: selectedSpaceIds,
        granularity: trendGranularity,
      })
      if (seq !== trendSeq.current) return
      setTrendRows(res.list || [])
      setTrendUnavailable(false)
    } catch (error) {
      if (seq !== trendSeq.current) return
      setTrendRows([])
      if (error instanceof ApiError && error.status === 404) {
        setTrendUnavailable(true)
      } else {
        message.error(dashboardErrorMessage(error))
      }
    } finally {
      if (seq === trendSeq.current) setTrendLoading(false)
    }
  }, [dashboardErrorMessage, rangeParams, selectedSpaceIds, trendGranularity])

  const fetchDirectChats = useCallback(async () => {
    const seq = ++directSeq.current
    setDirectLoading(true)
    try {
      const res = await listDashboardDirectChats({
        ...rangeParams,
        sort_by: directSortBy,
        order: directOrder,
        page_index: directPage,
        page_size: directPageSize,
      })
      if (seq !== directSeq.current) return
      setDirectChats(res.list || [])
      setDirectTotal(res.count || 0)
    } catch (error) {
      if (seq === directSeq.current) message.error(dashboardErrorMessage(error))
    } finally {
      if (seq === directSeq.current) setDirectLoading(false)
    }
  }, [dashboardErrorMessage, directOrder, directPage, directPageSize, directSortBy, rangeParams])

  const fetchChannels = useCallback(async () => {
    if (!drawerSpace) return
    const seq = ++channelsSeq.current
    setChannelsLoading(true)
    try {
      const res = await listDashboardChannels(drawerSpace.space_id, {
        ...rangeParams,
        active_status: channelActive,
        sort_by: channelSortBy,
        order: channelOrder,
        page_index: channelPage,
        page_size: channelPageSize,
      })
      if (seq !== channelsSeq.current) return
      setChannels(res.list || [])
      setChannelsTotal(res.count || 0)
    } catch (error) {
      if (seq === channelsSeq.current) message.error(dashboardErrorMessage(error))
    } finally {
      if (seq === channelsSeq.current) setChannelsLoading(false)
    }
  }, [
    channelActive,
    channelOrder,
    channelPage,
    channelPageSize,
    channelSortBy,
    dashboardErrorMessage,
    drawerSpace,
    rangeParams,
  ])

  const handleSpaceOptionSearch = useCallback(
    (value: string) => {
      clearSpaceOptionsSearchTimer()
      spaceOptionsSearchTimer.current = setTimeout(() => {
        void fetchSpaceOptions(value)
      }, 300)
    },
    [clearSpaceOptionsSearchTimer, fetchSpaceOptions],
  )

  useEffect(() => {
    void fetchOverview()
  }, [fetchOverview])

  useEffect(() => {
    void fetchSpaceOptions()
  }, [fetchSpaceOptions])

  useEffect(() => {
    void fetchChartSpaces()
  }, [fetchChartSpaces])

  useEffect(() => {
    void fetchTrend()
  }, [fetchTrend])

  useEffect(() => {
    if (spacesSectionReady) void fetchSpaces()
  }, [fetchSpaces, spacesSectionReady])

  useEffect(() => {
    if (selectedSpaceIds.length > 0) {
      directSeq.current += 1
      setDirectChats([])
      setDirectTotal(0)
      setDirectLoading(false)
      return
    }
    if (directSectionReady) void fetchDirectChats()
  }, [directSectionReady, fetchDirectChats, selectedSpaceIds])

  useEffect(() => {
    if (drawerOpen) void fetchChannels()
  }, [drawerOpen, fetchChannels])

  useEffect(() => () => clearSpaceOptionsSearchTimer(), [clearSpaceOptionsSearchTimer])

  useEffect(() => {
    const nodes = DASHBOARD_SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node))
    if (nodes.length === 0) return
    if (!('IntersectionObserver' in window)) return

    // Section ids are on always-rendered wrappers; lazy table content stays nested inside them.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target.id && DASHBOARD_SECTION_IDS.includes(visible.target.id as DashboardSectionId)) {
          setActiveSection(visible.target.id as DashboardSectionId)
        }
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: [0.05, 0.2, 0.45] },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  const metricCards = useMemo(
    () => [
      {
        key: 'spaces',
        title: t('kpi.spaces'),
        value: currentOverview.space_total,
        icon: <AppstoreOutlined />,
        meta: metricMeta,
      },
      {
        key: 'groups',
        title: t('kpi.groups'),
        value: currentOverview.group_total,
        icon: <TeamOutlined />,
        detail: t('kpi.meta.active', {
          count: formatNumber(currentOverview.active_groups),
          rate: formatPercent(currentOverview.active_groups, currentOverview.group_total),
        }),
        meta: metricMeta,
      },
      {
        key: 'humanMembers',
        title: t('kpi.humanMembers'),
        value: currentOverview.human_member_total,
        icon: <UserOutlined />,
        detail: t('kpi.meta.active', {
          count: formatNumber(currentOverview.active_human_members),
          rate: formatPercent(currentOverview.active_human_members, currentOverview.human_member_total),
        }),
        meta: metricMeta,
      },
      {
        key: 'agents',
        title: t('kpi.agents'),
        value: currentOverview.agent_total,
        icon: <RobotOutlined />,
        detail: t('kpi.meta.active', {
          count: formatNumber(currentOverview.active_agent_members),
          rate: formatPercent(currentOverview.active_agent_members, currentOverview.agent_total),
        }),
        meta: metricMeta,
      },
      {
        key: 'humanMessages',
        title: t('kpi.humanMessages'),
        value: currentOverview.human_msg_count,
        icon: <MessageOutlined />,
        meta: metricMeta,
      },
      {
        key: 'agentMessages',
        title: t('kpi.agentMessages'),
        value: currentOverview.agent_msg_count,
        icon: <MessageOutlined />,
        meta: metricMeta,
      },
      {
        key: 'privateChats',
        title: t('kpi.privateChats'),
        value: currentOverview.private_active_count,
        icon: <CommentOutlined />,
        meta: privateMetricMeta,
      },
    ],
    [currentOverview, metricMeta, privateMetricMeta, t],
  )

  const messageComposition = useMemo(
    () => [
      {
        label: t('charts.messageComposition.human'),
        value: currentOverview.human_msg_count,
        color: '#4f46e5',
      },
      {
        label: t('charts.messageComposition.agent'),
        value: currentOverview.agent_msg_count,
        color: '#10b981',
      },
    ],
    [currentOverview.agent_msg_count, currentOverview.human_msg_count, t],
  )

  const memberComposition = useMemo(
    () => [
      {
        label: t('charts.memberComposition.human'),
        value: currentOverview.human_member_total,
        color: '#0ea5e9',
      },
      {
        label: t('charts.memberComposition.agent'),
        value: currentOverview.agent_total,
        color: '#f59e0b',
      },
    ],
    [currentOverview.agent_total, currentOverview.human_member_total, t],
  )

  const topSpaceMessageRows = useMemo(
    () => {
      const selectedSet = new Set(selectedSpaceIds)
      return [...chartSpaces]
        .filter((space) => selectedSet.size === 0 || selectedSet.has(space.space_id))
        .map((space) => ({
          label: space.name || space.space_id,
          value: totalMessages(space),
          primary: space.human_msg_count,
          secondary: space.agent_msg_count,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
    },
    [chartSpaces, selectedSpaceIds],
  )

  const openChannelDrawer = useCallback((space: DashboardSpaceItem) => {
    setDrawerSpace(space)
    setDrawerOpen(true)
    setChannelActive('all')
    setChannelPage(1)
    setChannelSortBy('last_active')
    setChannelOrder('desc')
    channelsSeq.current += 1
    setChannels([])
    setChannelsTotal(0)
    setChannelsLoading(false)
  }, [])

  const applySpaceSearch = useCallback(() => {
    setSpacePage(1)
    setSpaceKeyword(spaceSearch.trim())
  }, [spaceSearch])

  const refreshAll = useCallback(() => {
    void fetchOverview()
    void fetchChartSpaces()
    void fetchTrend()
    if (spacesSectionReady) void fetchSpaces()
    if (selectedSpaceIds.length === 0 && directSectionReady) void fetchDirectChats()
    if (drawerOpen) void fetchChannels()
  }, [
    directSectionReady,
    drawerOpen,
    fetchChannels,
    fetchChartSpaces,
    fetchDirectChats,
    fetchOverview,
    fetchSpaces,
    fetchTrend,
    selectedSpaceIds.length,
    spacesSectionReady,
  ])

  const handleRunEtl = useCallback(async () => {
    setEtlLoading(true)
    try {
      await runDashboardEtl()
      message.success(t('toast.etlAccepted'))
      refreshAll()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        message.warning(dashboardErrorMessage(error))
      } else {
        message.error(dashboardErrorMessage(error))
      }
    } finally {
      setEtlLoading(false)
    }
  }, [dashboardErrorMessage, refreshAll, t])

  const handleSpaceTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, unknown>,
    sorter: SorterResult<DashboardSpaceItem> | SorterResult<DashboardSpaceItem>[],
  ) => {
    setSpacePage(pagination.current || 1)
    setSpacePageSize(pagination.pageSize || MAIN_LIST_PAGE_SIZE)
    const firstSorter = Array.isArray(sorter) ? sorter[0] : sorter
    if (!firstSorter?.order) {
      setSpaceSortBy('last_active')
      setSpaceOrder('desc')
      return
    }
    const key = sorterKey(firstSorter as SorterResult<unknown>, 'last_active')
    if (isSpaceSortBy(key)) {
      setSpaceSortBy(key)
      setSpaceOrder(antOrder(firstSorter.order))
    }
  }

  const handleDirectTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, unknown>,
    sorter: SorterResult<DashboardDirectChatItem> | SorterResult<DashboardDirectChatItem>[],
  ) => {
    setDirectPage(pagination.current || 1)
    setDirectPageSize(pagination.pageSize || MAIN_LIST_PAGE_SIZE)
    const firstSorter = Array.isArray(sorter) ? sorter[0] : sorter
    if (!firstSorter?.order) {
      setDirectSortBy('last_active')
      setDirectOrder('desc')
      return
    }
    const key = sorterKey(firstSorter as SorterResult<unknown>, 'last_active')
    if (isDirectSortBy(key)) {
      setDirectSortBy(key)
      setDirectOrder(antOrder(firstSorter.order))
    }
  }

  const handleChannelTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, unknown>,
    sorter: SorterResult<DashboardChannelItem> | SorterResult<DashboardChannelItem>[],
  ) => {
    setChannelPage(pagination.current || 1)
    setChannelPageSize(pagination.pageSize || DRAWER_PAGE_SIZE)
    const firstSorter = Array.isArray(sorter) ? sorter[0] : sorter
    if (!firstSorter?.order) {
      setChannelSortBy('last_active')
      setChannelOrder('desc')
      return
    }
    const key = sorterKey(firstSorter as SorterResult<unknown>, 'last_active')
    if (isChannelSortBy(key)) {
      setChannelSortBy(key)
      setChannelOrder(antOrder(firstSorter.order))
    }
  }

  const convTypeLabel = useCallback(
    (value: number) => t(`convType.${value}`, { defaultValue: t('convType.unknown') }),
    [t],
  )

  const convTypeMessageRows = useMemo(() => {
    const items = currentOverview.message_composition || []
    const byType = new Map(items.map((item) => [item.conv_type, item]))

    return CONV_TYPE_VALUES.map((convType) => {
      const item = byType.get(convType)
      return {
        label: convTypeLabel(convType),
        value: item?.total_msg_count || 0,
        primary: item?.human_msg_count || 0,
        secondary: item?.agent_msg_count || 0,
      }
    })
  }, [convTypeLabel, currentOverview.message_composition])

  const statusColumn = useCallback(
    (active: boolean) => (
      active ? (
        <span className="pill-dot online">{t('status.active')}</span>
      ) : (
        <span className="pill-dot offline">{t('status.inactive')}</span>
      )
    ),
    [t],
  )

  const spaceColumns = useMemo<ColumnsType<DashboardSpaceItem>>(
    () => [
      {
        title: t('spaces.column.name'),
        dataIndex: 'name',
        key: 'name',
        fixed: 'left',
        width: 220,
        render: (name: string, record) => (
          <Button type="link" className="dashboard-table-link cell-primary" onClick={() => openChannelDrawer(record)}>
            {name || '-'}
          </Button>
        ),
      },
      {
        title: t('spaces.column.status'),
        dataIndex: 'is_active',
        key: 'is_active',
        width: 110,
        render: statusColumn,
      },
      {
        title: t('spaces.column.groups'),
        dataIndex: 'group_total',
        key: 'group_total',
        width: 110,
        align: 'right',
        className: 'dashboard-number-column',
        sorter: true,
        sortOrder: spaceSortBy === 'group_total' ? orderToAntd(spaceOrder) : null,
        render: formatNumber,
      },
      {
        title: t('spaces.column.humanMembers'),
        dataIndex: 'human_member_total',
        key: 'human_member_total',
        width: 130,
        align: 'right',
        className: 'dashboard-number-column',
        sorter: true,
        sortOrder: spaceSortBy === 'human_member_total' ? orderToAntd(spaceOrder) : null,
        render: formatNumber,
      },
      {
        title: t('spaces.column.agents'),
        dataIndex: 'agent_total',
        key: 'agent_total',
        width: 110,
        align: 'right',
        className: 'dashboard-number-column',
        render: formatNumber,
      },
      {
        title: t('spaces.column.messages'),
        key: 'total_msg',
        width: 240,
        sorter: true,
        sortOrder: spaceSortBy === 'total_msg' ? orderToAntd(spaceOrder) : null,
        render: (_, record) => (
          <MessageSplitCell
            human={record.human_msg_count || 0}
            agent={record.agent_msg_count || 0}
            humanLabel={t('charts.messageComposition.human')}
            agentLabel={t('charts.messageComposition.agent')}
          />
        ),
      },
      {
        title: t('spaces.column.lastActive'),
        dataIndex: 'last_active',
        key: 'last_active',
        width: 170,
        align: 'right',
        sorter: true,
        sortOrder: spaceSortBy === 'last_active' ? orderToAntd(spaceOrder) : null,
        render: (value: number) => <span style={{ color: 'var(--a-text-tertiary)' }}>{formatTime(value)}</span>,
      },
    ],
    [openChannelDrawer, spaceOrder, spaceSortBy, statusColumn, t],
  )

  const directColumns = useMemo<ColumnsType<DashboardDirectChatItem>>(
    () => [
      {
        title: t('direct.column.members'),
        key: 'members',
        width: 380,
        render: (_, record) => (
          <div className="dashboard-direct-members">
            <div className="dashboard-direct-members-main">
              <span className="cell-primary">
                {record.member_a_name || record.member_a_uid || '-'} / {record.member_b_name || record.member_b_uid || '-'}
              </span>
              <span className="pill-outline brand">{convTypeLabel(record.conv_type)}</span>
            </div>
            <span className="dashboard-direct-members-uid mono">
              {record.member_a_uid || '-'} / {record.member_b_uid || '-'}
            </span>
          </div>
        ),
      },
      {
        title: t('direct.column.messages'),
        dataIndex: 'msg_count',
        key: 'msg_count',
        width: 130,
        align: 'right',
        className: 'dashboard-number-column',
        sorter: true,
        sortOrder: directSortBy === 'msg_count' ? orderToAntd(directOrder) : null,
        render: (value: number) => <span className="cell-primary">{formatNumber(value)}</span>,
      },
      {
        title: t('direct.column.lastActive'),
        dataIndex: 'last_active',
        key: 'last_active',
        width: 170,
        align: 'right',
        sorter: true,
        sortOrder: directSortBy === 'last_active' ? orderToAntd(directOrder) : null,
        render: (value: number) => <span style={{ color: 'var(--a-text-tertiary)' }}>{formatTime(value)}</span>,
      },
      {
        title: t('common:column.id'),
        dataIndex: 'channel_id',
        key: 'channel_id',
        width: 220,
        render: (value: string) => (
          <Tooltip title={value}>
            <Text className="mono" copyable={{ text: value }} ellipsis style={{ maxWidth: 190 }}>
              {value}
            </Text>
          </Tooltip>
        ),
      },
    ],
    [convTypeLabel, directOrder, directSortBy, t],
  )

  // 消息 mini bar 的归一化基准:当前页内最大总消息数(分页表格只能按页内相对值着色)。
  const maxChannelMsg = useMemo(
    () => channels.reduce((max, c) => Math.max(max, totalMessages(c)), 0),
    [channels],
  )

  // 当前列表内重名的群组名集合;重名时在卡片名后挂 ID 尾号 tag 以便区分(开发标注稿 §03/§04)。
  const duplicateChannelNames = useMemo(() => {
    const counts = new Map<string, number>()
    channels.forEach((c) => counts.set(c.name, (counts.get(c.name) || 0) + 1))
    return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name))
  }, [channels])

  const channelColumns = useMemo<ColumnsType<DashboardChannelItem>>(
    () => [
      {
        title: t('channels.column.name'),
        dataIndex: 'name',
        key: 'name',
        render: (value: string, record) => (
          <div className="ch-name-cell">
            <div className="ch-name-row">
              <Tooltip title={value} mouseEnterDelay={0.3}>
                <span className="ch-name-text">{value ? truncateLabel(value, 22) : '-'}</span>
              </Tooltip>
              {duplicateChannelNames.has(value) && (
                <span className="ch-name-tag">#{record.channel_id.slice(-4)}</span>
              )}
              <Tooltip title={record.channel_id}>
                <Text className="ch-name-copy mono" copyable={{ text: record.channel_id }} />
              </Tooltip>
            </div>
            <div className="ch-name-type">{convTypeLabel(record.conv_type)}</div>
          </div>
        ),
      },
      {
        title: t('channels.column.members'),
        dataIndex: 'member_count',
        key: 'member_count',
        width: 130,
        align: 'right',
        sorter: true,
        sortOrder: channelSortBy === 'member_count' ? orderToAntd(channelOrder) : null,
        render: (_, record) => (
          <div className="ch-metric">
            <span className="ch-metric-num">{formatNumber(record.member_count)}</span>
            <span className="ch-metric-sub">
              {record.agent_member_count > 0
                ? t('channels.metric.memberSub', {
                    human: record.human_member_count,
                    agent: record.agent_member_count,
                  })
                : t('channels.metric.memberHumanOnly', { human: record.human_member_count })}
            </span>
          </div>
        ),
      },
      {
        title: t('channels.column.messages'),
        key: 'total_msg',
        width: 280,
        align: 'right',
        sorter: true,
        sortOrder: channelSortBy === 'total_msg' ? orderToAntd(channelOrder) : null,
        render: (_, record) => {
          const total = totalMessages(record)
          const tone = channelMsgTone(total, maxChannelMsg)
          const heat = channelHeatWidths(
            total,
            record.human_msg_count,
            record.agent_msg_count,
            maxChannelMsg,
          )
          return (
            <div className="ch-msg">
              <div className="ch-msg-num-row">
                <span
                  className="ch-msg-num"
                  style={{ fontSize: tone.fontSize, opacity: tone.opacity }}
                >
                  {formatNumber(total)}
                </span>
                <span className="ch-msg-unit">{t('channels.card.unit')}</span>
              </div>
              {total > 0 && (
                <div className="ch-heat">
                  <span className="ch-heat-human" style={{ width: `${heat.human}%` }} />
                  <span className="ch-heat-bot" style={{ width: `${heat.bot}%` }} />
                </div>
              )}
              <div className="ch-msg-sub">
                {record.agent_msg_count > 0
                  ? t('channels.metric.msgSub', {
                      human: record.human_msg_count,
                      agent: record.agent_msg_count,
                    })
                  : t('channels.metric.msgHumanOnly', { human: record.human_msg_count })}
              </div>
            </div>
          )
        },
      },
      {
        title: t('channels.column.lastActive'),
        dataIndex: 'last_active_at',
        key: 'last_active',
        width: 180,
        align: 'right',
        className: 'ch-col-active',
        onHeaderCell: () => ({ className: 'ch-col-active' }),
        sorter: true,
        sortOrder: channelSortBy === 'last_active' ? orderToAntd(channelOrder) : null,
        render: (value: number) => (
          <div className="ch-time">
            <div className="ch-time-abs">{formatTime(value)}</div>
            <div className="ch-time-rel">{relativeTimeLabel(value, t)}</div>
          </div>
        ),
      },
    ],
    [channelOrder, channelSortBy, convTypeLabel, duplicateChannelNames, maxChannelMsg, t],
  )

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading-row">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-subtitle">{t('subtitle')}</p>
        </div>
        {canRunEtl && (
          <Popconfirm
            title={t('action.runEtlConfirmTitle')}
            description={t('action.runEtlConfirmDesc')}
            okText={t('common:action.confirm')}
            cancelText={t('common:action.cancel')}
            onConfirm={handleRunEtl}
            disabled={etlLoading}
          >
            <Button
              type="primary"
              icon={<SyncOutlined />}
              loading={etlLoading}
            >
              {t('action.runEtl')}
            </Button>
          </Popconfirm>
        )}
      </div>

      <nav className="dashboard-anchor-nav" aria-label={t('nav.aria')}>
        <a className={activeSection === 'dashboard-kpis' ? 'active' : undefined} href="#dashboard-kpis">{t('nav.kpis')}</a>
        <a className={activeSection === 'dashboard-charts' ? 'active' : undefined} href="#dashboard-charts">{t('nav.charts')}</a>
        <a className={activeSection === 'dashboard-spaces' ? 'active' : undefined} href="#dashboard-spaces">{t('nav.spaces')}</a>
        <a className={activeSection === 'dashboard-direct' ? 'active' : undefined} href="#dashboard-direct">{t('nav.direct')}</a>
      </nav>

      <div className="toolbar">
        <RangePicker
          value={dateRange}
          format={DATE_FORMAT}
          allowClear={false}
          style={{ width: 260 }}
          onChange={(values) => {
            if (values?.[0] && values?.[1]) {
              setDateRange([values[0], values[1]])
              setSpacePage(1)
              setDirectPage(1)
              setChannelPage(1)
              clearSpaceOptionsSearchTimer()
              setSpaceOptions((prev) => prev.filter((space) => selectedSpaceIds.includes(space.space_id)))
            }
          }}
        />
        <Select
          mode="multiple"
          showSearch
          allowClear
          maxTagCount="responsive"
          value={selectedSpaceIds}
          placeholder={t('filter.space.placeholder')}
          onOpenChange={(open) => {
            if (open && spaceOptions.length === 0) void fetchSpaceOptions()
          }}
          onSearch={handleSpaceOptionSearch}
          onChange={(value) => {
            setSelectedSpaceIds(value)
            setDirectPage(1)
          }}
          filterOption={false}
          loading={spaceOptionsLoading}
          style={{ width: 360 }}
          options={spaceOptions.map((space) => ({
            value: space.space_id,
            label: space.name || space.space_id,
          }))}
        />
        <div className="toolbar-spacer" />
        <Button icon={<ReloadOutlined />} onClick={refreshAll}>
          {t('common:action.refresh')}
        </Button>
      </div>

      <div className="status-banner" role="status" aria-live="polite">
        <span className="status-dot" aria-hidden />
        <span>{t('summary.ready')}</span>
        <span className="status-meta">
          {selectedSpaceIds.length > 0
            ? t('summary.filteredMeta', { range: rangeLabel, count: selectedSpaceIds.length })
            : t('summary.globalMeta', { range: rangeLabel })}
        </span>
      </div>

      <div id="dashboard-kpis" className="dashboard-metric-sections">
        <section className="dashboard-metric-section">
          <div className="dashboard-metric-section-title">{t('kpi.group.scale')}</div>
          <div className="dashboard-metric-grid scale">
            {metricCards.slice(0, 4).map(({ key, ...metric }) => (
              <div key={key}>
                <MetricCard {...metric} loading={overviewLoading} />
              </div>
            ))}
          </div>
        </section>
        <section className="dashboard-metric-section">
          <div className="dashboard-metric-section-title">{t('kpi.group.activity')}</div>
          <div className="dashboard-metric-grid activity">
            {metricCards.slice(4).map(({ key, ...metric }) => (
              <div key={key}>
                <MetricCard {...metric} loading={overviewLoading} />
              </div>
            ))}
          </div>
        </section>
      </div>

      <div id="dashboard-charts" className="dashboard-section-header">
        <div>
          <h2>{t('charts.title')}</h2>
          <p>{t('charts.subtitle')}</p>
        </div>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title={t('charts.messageComposition.title')} className="dashboard-chart-card">
            <DonutChart
              title={t('charts.empty.title')}
              ariaLabel={t('charts.messageComposition.title')}
              centerLabel={t('charts.messageComposition.center')}
              emptyHint={t('charts.messageComposition.empty')}
              items={messageComposition}
              valueLabel={t('charts.tooltip.value')}
              shareLabel={t('charts.tooltip.share')}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t('charts.memberComposition.title')} className="dashboard-chart-card">
            <DonutChart
              title={t('charts.empty.title')}
              ariaLabel={t('charts.memberComposition.title')}
              centerLabel={t('charts.memberComposition.center')}
              emptyHint={t('charts.memberComposition.empty')}
              items={memberComposition}
              valueLabel={t('charts.tooltip.value')}
              shareLabel={t('charts.tooltip.share')}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t('charts.topSpaces.title')} className="dashboard-chart-card">
            <HorizontalBars
              title={t('charts.empty.title')}
              ariaLabel={t('charts.topSpaces.title')}
              hint={chartSpacesLoading ? t('charts.loading') : t('charts.topSpaces.empty')}
              primaryLabel={t('charts.messageComposition.human')}
              secondaryLabel={t('charts.messageComposition.agent')}
              rows={topSpaceMessageRows}
              totalLabel={t('charts.tooltip.total')}
              shareLabel={t('charts.tooltip.share')}
              scale="log"
              scaleLabel={t('charts.topSpaces.scaleLog')}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card
            title={t('charts.trend.title')}
            className="dashboard-chart-card"
            extra={
              <Space className="dashboard-trend-controls" size={10} wrap>
                <Segmented
                  size="small"
                  value={trendDisplayMode}
                  onChange={(value) => setTrendDisplayMode(value as DashboardTrendDisplayMode)}
                  options={[
                    { label: t('charts.trend.absolute'), value: 'absolute' },
                    { label: t('charts.trend.share'), value: 'share' },
                  ]}
                />
                <span className="dashboard-trend-control-divider" aria-hidden />
                <Segmented
                  size="small"
                  value={trendGranularity}
                  onChange={(value) => setTrendGranularity(value as DashboardTrendGranularity)}
                  options={[
                    { label: t('charts.trend.day'), value: 'day' },
                    { label: t('charts.trend.week'), value: 'week' },
                  ]}
                />
              </Space>
            }
          >
            <TrendLineChart
              rows={trendRows}
              granularity={trendGranularity}
              displayMode={trendDisplayMode}
              loading={trendLoading}
              emptyTitle={t('charts.empty.title')}
              emptyHint={trendUnavailable ? t('charts.trend.unavailable') : t('charts.trend.empty')}
              loadingHint={t('charts.trend.loading')}
              ariaLabel={t('charts.trend.title')}
              humanLabel={t('charts.messageComposition.human')}
              agentLabel={t('charts.messageComposition.agent')}
              totalLabel={t('charts.tooltip.total')}
              agentShareLabel={t('charts.tooltip.agentShare')}
              agentRatioLabel={t('charts.tooltip.agentRatio')}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t('charts.convType.title')} className="dashboard-chart-card">
            <HorizontalBars
              title={t('charts.empty.title')}
              ariaLabel={t('charts.convType.title')}
              hint={t('charts.convType.empty')}
              primaryLabel={t('charts.messageComposition.human')}
              secondaryLabel={t('charts.messageComposition.agent')}
              rows={convTypeMessageRows}
              totalLabel={t('charts.tooltip.total')}
              shareLabel={t('charts.tooltip.share')}
            />
          </Card>
        </Col>
      </Row>

      <div id="dashboard-spaces" ref={spacesSectionRef} className="dashboard-lazy-section">
        <div className="dashboard-section-header">
          <div>
            <h2>{t('spaces.title')}</h2>
            <p>{t('spaces.subtitle')}</p>
          </div>
        </div>
        {spacesSectionReady ? (
          <>
            <div className="toolbar dashboard-table-toolbar">
              <Input
                placeholder={t('spaces.search.placeholder')}
                prefix={<SearchOutlined />}
                value={spaceSearch}
                onChange={(event) => setSpaceSearch(event.target.value)}
                onPressEnter={applySpaceSearch}
                allowClear
                style={{ width: 260 }}
              />
              <Select
                value={spaceActive}
                onChange={(value) => {
                  setSpaceActive(value)
                  setSpacePage(1)
                }}
                style={{ width: 140 }}
                options={[
                  { value: 'all', label: t('status.all') },
                  { value: 'active', label: t('status.active') },
                  { value: 'inactive', label: t('status.inactive') },
                ]}
              />
              <Button type="primary" icon={<SearchOutlined />} onClick={applySpaceSearch}>
                {t('common:action.search')}
              </Button>
              <div className="toolbar-spacer" />
              <span className="dashboard-toolbar-meta">
                {t('spaces.toolbar.total', { count: formatNumber(spacesTotal) })}
              </span>
              <Button icon={<ReloadOutlined />} onClick={() => void fetchSpaces()}>
                {t('common:action.refresh')}
              </Button>
            </div>
            <div className="dashboard-table-shell">
              <Table
                columns={spaceColumns}
                dataSource={spaces}
                rowKey="space_id"
                loading={spacesLoading}
                size="middle"
                rowClassName={(record) => (!record.is_active ? 'dashboard-row-inactive' : '')}
                scroll={{ x: 1080 }}
                onChange={handleSpaceTableChange}
                pagination={{
                  current: spacePage,
                  total: spacesTotal,
                  pageSize: spacePageSize,
                  pageSizeOptions: MAIN_LIST_PAGE_SIZE_OPTIONS,
                  showSizeChanger: true,
                  showTotal: (count) => t('common:table.total', { count }),
                }}
              />
            </div>
          </>
        ) : (
          <LazyTablePlaceholder title={t('lazy.spaces.title')} hint={t('lazy.spaces.hint')} />
        )}
      </div>

      <div id="dashboard-direct" ref={directSectionRef} className="dashboard-lazy-section">
        <div className="dashboard-section-header">
          <div>
            <h2>{t('direct.title')}</h2>
            <p>{t('direct.subtitle')}</p>
          </div>
        </div>
        {selectedSpaceIds.length > 0 ? (
          <Card styles={{ body: { padding: 0 } }}>
            <div className="empty-card">
              <div className="empty-illust">
                <CommentOutlined />
              </div>
              <div className="empty-title">{t('direct.filteredEmpty.title')}</div>
              <div className="empty-hint-text">{t('direct.filteredEmpty.hint')}</div>
            </div>
          </Card>
        ) : directSectionReady ? (
          <div className="dashboard-table-shell">
            <Table
              columns={directColumns}
              dataSource={directChats}
              rowKey="channel_id"
              loading={directLoading}
              size="middle"
              scroll={{ x: 900 }}
              onChange={handleDirectTableChange}
              pagination={{
                current: directPage,
                total: directTotal,
                pageSize: directPageSize,
                pageSizeOptions: MAIN_LIST_PAGE_SIZE_OPTIONS,
                showSizeChanger: true,
                showTotal: (count) => t('common:table.total', { count }),
              }}
            />
          </div>
        ) : (
          <LazyTablePlaceholder title={t('lazy.direct.title')} hint={t('lazy.direct.hint')} />
        )}
      </div>

      <Drawer
        className="admin-shell admin-drawer dashboard-drawer dashboard-drawer-max"
        width="100%"
        title={drawerSpace ? t('channels.title', { name: drawerSpace.name || drawerSpace.space_id }) : t('channels.titleFallback')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
      >
        <div className="toolbar toolbar-plain">
          <Select
            value={channelActive}
            onChange={(value) => {
              setChannelActive(value)
              setChannelPage(1)
            }}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: t('status.all') },
              { value: 'active', label: t('status.active') },
              { value: 'inactive', label: t('status.inactive') },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void fetchChannels()}>
            {t('common:action.refresh')}
          </Button>
        </div>
        <Table
          columns={channelColumns}
          dataSource={channels}
          rowKey="channel_id"
          loading={channelsLoading}
          size="middle"
          scroll={{ y: 'calc(100vh - 215px)' }}
          onChange={handleChannelTableChange}
          pagination={{
            current: channelPage,
            total: channelsTotal,
            pageSize: channelPageSize,
            pageSizeOptions: DRAWER_PAGE_SIZE_OPTIONS,
            showSizeChanger: true,
            showTotal: (count) => t('common:table.total', { count }),
          }}
        />
      </Drawer>
    </div>
  )
}
