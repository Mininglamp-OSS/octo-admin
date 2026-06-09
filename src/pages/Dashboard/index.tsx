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

const { RangePicker } = DatePicker
const { Text } = Typography

const DATE_FORMAT = 'YYYY-MM-DD'
const PAGE_SIZE = 20

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
  'human_msg_count',
  'agent_msg_count',
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

const numberFormat = new Intl.NumberFormat()

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
  loading,
  highlight,
}: {
  title: string
  value: number
  icon: ReactNode
  meta: ReactNode
  loading: boolean
  highlight?: boolean
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
        valueStyle={highlight ? { color: 'var(--a-brand)' } : undefined}
      />
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

function DonutChart({
  title,
  centerLabel,
  emptyHint,
  items,
  ariaLabel,
}: {
  title: string
  centerLabel: string
  emptyHint: string
  items: { label: string; value: number; color: string }[]
  ariaLabel: string
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) return <EmptyChart title={title} hint={emptyHint} />

  const size = 168
  const center = size / 2
  const radius = 60
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="dashboard-chart-body">
      <div className="dashboard-donut-wrap">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
          <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--a-bg-muted)" strokeWidth="20" />
          {items.map((item) => {
            const length = (item.value / total) * circumference
            const segment = (
              <circle
                key={item.label}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="20"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${center} ${center})`}
              />
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
        {items.map((item) => (
          <div key={item.label} className="dashboard-chart-legend-item">
            <span style={{ background: item.color }} />
            <div>
              <strong>{item.label}</strong>
              <em>{formatNumber(item.value)} · {formatPercent(item.value, total)}</em>
            </div>
          </div>
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
}: {
  title: string
  hint: string
  primaryLabel?: string
  secondaryLabel?: string
  rows: { label: string; value: number; primary?: number; secondary?: number }[]
  ariaLabel: string
}) {
  const max = Math.max(...rows.map((row) => row.value), 0)
  if (max <= 0) return <EmptyChart title={title} hint={hint} />

  return (
    <div className="dashboard-bars" role="img" aria-label={ariaLabel}>
      {primaryLabel && secondaryLabel ? (
        <div className="dashboard-bar-legend">
          <span className="dashboard-bar-legend-primary">{primaryLabel}</span>
          <span className="dashboard-bar-legend-secondary">{secondaryLabel}</span>
        </div>
      ) : null}
      {rows.map((row) => {
        const secondary = row.secondary ?? 0
        const primary = row.primary ?? (row.secondary !== undefined ? Math.max(row.value - secondary, 0) : row.value)
        const segmentTotal = Math.max(row.value, primary + secondary, 1)
        return (
          <div key={row.label} className="dashboard-bar-row">
            <div className="dashboard-bar-label">
              <span>{truncateLabel(row.label)}</span>
              <strong>{formatNumber(row.value)}</strong>
            </div>
            <div className="dashboard-bar-track">
              <span className="dashboard-bar-fill" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}>
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
  loading,
  emptyTitle,
  emptyHint,
  humanLabel,
  agentLabel,
  loadingHint,
  ariaLabel,
}: {
  rows: DashboardTrendItem[]
  granularity: DashboardTrendGranularity
  loading: boolean
  emptyTitle: string
  emptyHint: string
  humanLabel: string
  agentLabel: string
  loadingHint: string
  ariaLabel: string
}) {
  const maxValue = Math.max(
    ...rows.map((row) => Math.max(row.total_msg_count || 0, row.human_msg_count || 0, row.agent_msg_count || 0)),
    0,
  )

  if (maxValue <= 0) {
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

  const totalPoints = pointsFor((row) => row.total_msg_count)
  const humanPoints = pointsFor((row) => row.human_msg_count)
  const agentPoints = pointsFor((row) => row.agent_msg_count)
  const totalPath = buildTrendPath(totalPoints)
  const humanPath = buildTrendPath(humanPoints)
  const agentPath = buildTrendPath(agentPoints)
  const areaPath = `${totalPath} L${totalPoints[totalPoints.length - 1].x.toFixed(1)},${bottom} L${totalPoints[0].x.toFixed(1)},${bottom} Z`
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
                {formatNumber(value)}
              </text>
            </g>
          )
        })}
        <path className="dashboard-trend-area" d={areaPath} />
        <path className="dashboard-trend-line human" d={humanPath} />
        <path className="dashboard-trend-line agent" d={agentPath} />
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
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(defaultDateRange)
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  const [spaceOptions, setSpaceOptions] = useState<DashboardSpaceItem[]>([])
  const [spaceOptionsLoading, setSpaceOptionsLoading] = useState(false)
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const [spaceSearch, setSpaceSearch] = useState('')
  const [spaceKeyword, setSpaceKeyword] = useState('')
  const [spaceActive, setSpaceActive] = useState<DashboardActiveStatus>('all')
  const [spacePage, setSpacePage] = useState(1)
  const [spacePageSize, setSpacePageSize] = useState(PAGE_SIZE)
  const [spaceSortBy, setSpaceSortBy] = useState<DashboardSpaceSortBy>('last_active')
  const [spaceOrder, setSpaceOrder] = useState<DashboardOrder>('desc')
  const [spaces, setSpaces] = useState<DashboardSpaceItem[]>([])
  const [spacesTotal, setSpacesTotal] = useState(0)
  const [spacesLoading, setSpacesLoading] = useState(false)
  const [spacesLoadedOnce, setSpacesLoadedOnce] = useState(false)
  const [chartSpaces, setChartSpaces] = useState<DashboardSpaceItem[]>([])
  const [chartSpacesLoading, setChartSpacesLoading] = useState(false)
  const [trendGranularity, setTrendGranularity] = useState<DashboardTrendGranularity>('day')
  const [trendRows, setTrendRows] = useState<DashboardTrendItem[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendUnavailable, setTrendUnavailable] = useState(false)

  const [directPage, setDirectPage] = useState(1)
  const [directPageSize, setDirectPageSize] = useState(PAGE_SIZE)
  const [directSortBy, setDirectSortBy] = useState<DashboardDirectChatSortBy>('last_active')
  const [directOrder, setDirectOrder] = useState<DashboardOrder>('desc')
  const [directChats, setDirectChats] = useState<DashboardDirectChatItem[]>([])
  const [directTotal, setDirectTotal] = useState(0)
  const [directLoading, setDirectLoading] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerSpace, setDrawerSpace] = useState<DashboardSpaceItem | null>(null)
  const [channelActive, setChannelActive] = useState<DashboardActiveStatus>('all')
  const [channelPage, setChannelPage] = useState(1)
  const [channelPageSize, setChannelPageSize] = useState(PAGE_SIZE)
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

  const mergeSpaceOptions = useCallback((items: DashboardSpaceItem[]) => {
    setSpaceOptions((prev) => {
      const map = new Map(prev.map((item) => [item.space_id, item]))
      items.forEach((item) => map.set(item.space_id, item))
      return Array.from(map.values())
    })
  }, [])

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
        if (seq === spaceOptionsSeq.current) mergeSpaceOptions(res.list || [])
      } catch (error) {
        if (seq === spaceOptionsSeq.current) message.error(dashboardErrorMessage(error))
      } finally {
        if (seq === spaceOptionsSeq.current) setSpaceOptionsLoading(false)
      }
    },
    [dashboardErrorMessage, mergeSpaceOptions, rangeParams],
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
      mergeSpaceOptions(res.list || [])
    } catch (error) {
      if (seq === spacesSeq.current) message.error(dashboardErrorMessage(error))
    } finally {
      if (seq === spacesSeq.current) {
        setSpacesLoading(false)
        setSpacesLoadedOnce(true)
      }
    }
  }, [
    mergeSpaceOptions,
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
      mergeSpaceOptions(res.list || [])
    } catch (error) {
      if (seq === chartSpacesSeq.current) message.error(dashboardErrorMessage(error))
    } finally {
      if (seq === chartSpacesSeq.current) setChartSpacesLoading(false)
    }
  }, [dashboardErrorMessage, mergeSpaceOptions, rangeParams, selectedSpaceIds])

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

  const metricCards = useMemo(
    () => [
      {
        key: 'spaces',
        title: t('kpi.spaces'),
        value: currentOverview.space_total,
        icon: <AppstoreOutlined />,
        meta: selectedSpaceIds.length
          ? t('kpi.meta.filtered', { count: selectedSpaceIds.length })
          : t('kpi.meta.range', { range: rangeLabel }),
      },
      {
        key: 'groups',
        title: t('kpi.groups'),
        value: currentOverview.group_total,
        icon: <TeamOutlined />,
        meta: t('kpi.meta.active', {
          count: formatNumber(currentOverview.active_groups),
          rate: formatPercent(currentOverview.active_groups, currentOverview.group_total),
        }),
      },
      {
        key: 'humanMembers',
        title: t('kpi.humanMembers'),
        value: currentOverview.human_member_total,
        icon: <UserOutlined />,
        meta: t('kpi.meta.active', {
          count: formatNumber(currentOverview.active_human_members),
          rate: formatPercent(currentOverview.active_human_members, currentOverview.human_member_total),
        }),
      },
      {
        key: 'agents',
        title: t('kpi.agents'),
        value: currentOverview.agent_total,
        icon: <RobotOutlined />,
        meta: t('kpi.meta.active', {
          count: formatNumber(currentOverview.active_agent_members),
          rate: formatPercent(currentOverview.active_agent_members, currentOverview.agent_total),
        }),
      },
      {
        key: 'humanMessages',
        title: t('kpi.humanMessages'),
        value: currentOverview.human_msg_count,
        icon: <MessageOutlined />,
        meta: t('kpi.meta.selectedRange'),
        highlight: true,
      },
      {
        key: 'agentMessages',
        title: t('kpi.agentMessages'),
        value: currentOverview.agent_msg_count,
        icon: <MessageOutlined />,
        meta: t('kpi.meta.selectedRange'),
        highlight: true,
      },
      {
        key: 'privateChats',
        title: t('kpi.privateChats'),
        value: currentOverview.private_active_count,
        icon: <CommentOutlined />,
        meta:
          selectedSpaceIds.length > 0
            ? t('kpi.meta.privateFiltered')
            : t('kpi.meta.globalOnly'),
      },
    ],
    [currentOverview, rangeLabel, selectedSpaceIds.length, t],
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
    setSpacePageSize(pagination.pageSize || PAGE_SIZE)
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
    setDirectPageSize(pagination.pageSize || PAGE_SIZE)
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
    setChannelPageSize(pagination.pageSize || PAGE_SIZE)
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
        sorter: true,
        sortOrder: spaceSortBy === 'group_total' ? orderToAntd(spaceOrder) : null,
        render: formatNumber,
      },
      {
        title: t('spaces.column.humanMembers'),
        dataIndex: 'human_member_total',
        key: 'human_member_total',
        width: 130,
        sorter: true,
        sortOrder: spaceSortBy === 'human_member_total' ? orderToAntd(spaceOrder) : null,
        render: formatNumber,
      },
      {
        title: t('spaces.column.agents'),
        dataIndex: 'agent_total',
        key: 'agent_total',
        width: 110,
        render: formatNumber,
      },
      {
        title: t('spaces.column.humanMessages'),
        dataIndex: 'human_msg_count',
        key: 'human_msg_count',
        width: 130,
        sorter: true,
        sortOrder: spaceSortBy === 'human_msg_count' ? orderToAntd(spaceOrder) : null,
        render: formatNumber,
      },
      {
        title: t('spaces.column.agentMessages'),
        dataIndex: 'agent_msg_count',
        key: 'agent_msg_count',
        width: 130,
        sorter: true,
        sortOrder: spaceSortBy === 'agent_msg_count' ? orderToAntd(spaceOrder) : null,
        render: formatNumber,
      },
      {
        title: t('spaces.column.totalMessages'),
        key: 'total_msg',
        width: 130,
        sorter: true,
        sortOrder: spaceSortBy === 'total_msg' ? orderToAntd(spaceOrder) : null,
        render: (_, record) => <span className="cell-primary">{formatNumber(totalMessages(record))}</span>,
      },
      {
        title: t('spaces.column.lastActive'),
        dataIndex: 'last_active',
        key: 'last_active',
        width: 170,
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
        width: 320,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <span className="cell-primary">
              {record.member_a_name || record.member_a_uid || '-'} / {record.member_b_name || record.member_b_uid || '-'}
            </span>
            <Text className="mono" type="secondary">
              {record.member_a_uid || '-'} / {record.member_b_uid || '-'}
            </Text>
          </Space>
        ),
      },
      {
        title: t('direct.column.type'),
        dataIndex: 'conv_type',
        key: 'conv_type',
        width: 120,
        render: (value: number) => <span className="pill-outline brand">{convTypeLabel(value)}</span>,
      },
      {
        title: t('direct.column.messages'),
        dataIndex: 'msg_count',
        key: 'msg_count',
        width: 130,
        sorter: true,
        sortOrder: directSortBy === 'msg_count' ? orderToAntd(directOrder) : null,
        render: (value: number) => <span className="cell-primary">{formatNumber(value)}</span>,
      },
      {
        title: t('direct.column.lastActive'),
        dataIndex: 'last_active',
        key: 'last_active',
        width: 170,
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

  const channelColumns = useMemo<ColumnsType<DashboardChannelItem>>(
    () => [
      {
        title: t('channels.column.name'),
        dataIndex: 'name',
        key: 'name',
        fixed: 'left',
        width: 220,
        render: (value: string) => <span className="cell-primary">{value || '-'}</span>,
      },
      {
        title: t('channels.column.status'),
        dataIndex: 'is_active',
        key: 'is_active',
        width: 110,
        render: statusColumn,
      },
      {
        title: t('channels.column.type'),
        dataIndex: 'conv_type',
        key: 'conv_type',
        width: 120,
        render: (value: number) => <span className="pill-outline brand">{convTypeLabel(value)}</span>,
      },
      {
        title: t('channels.column.members'),
        dataIndex: 'member_count',
        key: 'member_count',
        width: 120,
        sorter: true,
        sortOrder: channelSortBy === 'member_count' ? orderToAntd(channelOrder) : null,
        render: formatNumber,
      },
      {
        title: t('channels.column.humanMembers'),
        dataIndex: 'human_member_count',
        key: 'human_member_count',
        width: 120,
        render: formatNumber,
      },
      {
        title: t('channels.column.agents'),
        dataIndex: 'agent_member_count',
        key: 'agent_member_count',
        width: 110,
        render: formatNumber,
      },
      {
        title: t('channels.column.humanMessages'),
        dataIndex: 'human_msg_count',
        key: 'human_msg_count',
        width: 130,
        sorter: true,
        sortOrder: channelSortBy === 'human_msg_count' ? orderToAntd(channelOrder) : null,
        render: formatNumber,
      },
      {
        title: t('channels.column.agentMessages'),
        dataIndex: 'agent_msg_count',
        key: 'agent_msg_count',
        width: 130,
        sorter: true,
        sortOrder: channelSortBy === 'agent_msg_count' ? orderToAntd(channelOrder) : null,
        render: formatNumber,
      },
      {
        title: t('channels.column.totalMessages'),
        key: 'total_msg',
        width: 130,
        sorter: true,
        sortOrder: channelSortBy === 'total_msg' ? orderToAntd(channelOrder) : null,
        render: (_, record) => <span className="cell-primary">{formatNumber(totalMessages(record))}</span>,
      },
      {
        title: t('channels.column.lastActive'),
        dataIndex: 'last_active_at',
        key: 'last_active',
        width: 170,
        sorter: true,
        sortOrder: channelSortBy === 'last_active' ? orderToAntd(channelOrder) : null,
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
    [channelOrder, channelSortBy, convTypeLabel, statusColumn, t],
  )

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading-row">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-subtitle">{t('subtitle')}</p>
        </div>
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
      </div>

      <div className="toolbar">
        <RangePicker
          value={dateRange}
          format={DATE_FORMAT}
          allowClear={false}
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
          style={{ minWidth: 280, flex: '1 1 280px' }}
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

      <div className="dashboard-metric-grid">
        {metricCards.map(({ key, ...metric }) => {
          return (
            <div key={key}>
              <MetricCard {...metric} loading={overviewLoading} />
            </div>
          )
        })}
      </div>

      <div className="dashboard-section-header">
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
              <Segmented
                size="small"
                value={trendGranularity}
                onChange={(value) => setTrendGranularity(value as DashboardTrendGranularity)}
                options={[
                  { label: t('charts.trend.day'), value: 'day' },
                  { label: t('charts.trend.week'), value: 'week' },
                ]}
              />
            }
          >
            <TrendLineChart
              rows={trendRows}
              granularity={trendGranularity}
              loading={trendLoading}
              emptyTitle={t('charts.empty.title')}
              emptyHint={trendUnavailable ? t('charts.trend.unavailable') : t('charts.trend.empty')}
              loadingHint={t('charts.trend.loading')}
              ariaLabel={t('charts.trend.title')}
              humanLabel={t('charts.messageComposition.human')}
              agentLabel={t('charts.messageComposition.agent')}
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
            />
          </Card>
        </Col>
      </Row>

      <div ref={spacesSectionRef} className="dashboard-lazy-section">
        <div className="dashboard-section-header">
          <div>
            <h2>{t('spaces.title')}</h2>
            <p>{t('spaces.subtitle')}</p>
          </div>
        </div>
        {spacesSectionReady ? (
          <>
            <div className="toolbar">
              <Input
                placeholder={t('spaces.search.placeholder')}
                prefix={<SearchOutlined />}
                value={spaceSearch}
                onChange={(event) => setSpaceSearch(event.target.value)}
                onPressEnter={applySpaceSearch}
                allowClear
                style={{ width: 280 }}
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
            </div>
            <div className="dashboard-table-shell">
              <Table
                columns={spaceColumns}
                dataSource={spaces}
                rowKey="space_id"
                loading={spacesLoading}
                size="middle"
                scroll={{ x: 1300 }}
                onChange={handleSpaceTableChange}
                pagination={{
                  current: spacePage,
                  total: spacesTotal,
                  pageSize: spacePageSize,
                  pageSizeOptions: [20, 50, 100, 200],
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

      <div ref={directSectionRef} className="dashboard-lazy-section">
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
              scroll={{ x: 960 }}
              onChange={handleDirectTableChange}
              pagination={{
                current: directPage,
                total: directTotal,
                pageSize: directPageSize,
                pageSizeOptions: [20, 50, 100, 200],
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
        className="admin-drawer"
        width={960}
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
          scroll={{ x: 1580 }}
          onChange={handleChannelTableChange}
          pagination={{
            current: channelPage,
            total: channelsTotal,
            pageSize: channelPageSize,
            pageSizeOptions: [20, 50, 100, 200],
            showSizeChanger: true,
            showTotal: (count) => t('common:table.total', { count }),
          }}
        />
      </Drawer>
    </div>
  )
}
