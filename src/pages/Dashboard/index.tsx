import { useId } from 'react'
import { Card, Row, Col, Statistic } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  UserOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CloudUploadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  LineChartOutlined,
} from '@ant-design/icons'
import { useTheme } from '../../hooks/useTheme'

interface KpiCardProps {
  title: string
  value: number
  icon: React.ReactNode
  delta: number
  spark: number[]
}

function buildPath(values: number[], width: number, height: number) {
  if (values.length === 0) return { line: '', area: '' }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / Math.max(values.length - 1, 1)
  const points = values.map((v, i) => ({
    x: i * step,
    y: height - ((v - min) / range) * (height - 2) - 1,
  }))
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height} L0,${height} Z`
  return { line, area }
}

function Sparkline({ data, color, muted }: { data: number[]; color: string; muted: boolean }) {
  const width = 96
  const height = 36
  const { line, area } = buildPath(data, width, height)
  const gradId = useId().replace(/:/g, '-')
  const strokeColor = muted ? 'var(--a-text-quaternary)' : color
  return (
    <svg width={width} height={height} style={{ overflow: 'visible', flexShrink: 0, opacity: muted ? 0.4 : 1 }}>
      <defs>
        <linearGradient id={`spark-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={muted ? 0.1 : 0.22} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${gradId})`} />
      <path d={line} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DeltaTag({ delta, muted }: { delta: number; muted: boolean }) {
  const { t } = useTranslation('dashboard')
  if (muted) {
    return (
      <span className="kpi-delta flat" style={{ color: 'var(--a-text-quaternary)' }}>
        {t('delta.empty')}
      </span>
    )
  }
  const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const Icon = delta > 0 ? ArrowUpOutlined : delta < 0 ? ArrowDownOutlined : MinusOutlined
  const text = delta === 0 ? t('delta.flat') : `${Math.abs(delta).toFixed(1)}%`
  return (
    <span className={`kpi-delta ${cls}`}>
      <Icon style={{ fontSize: 11 }} />
      {text}
      <span className="kpi-delta-label">{t('delta.label')}</span>
    </span>
  )
}

function KpiCard({ title, value, icon, delta, spark, brandColor }: KpiCardProps & { brandColor: string }) {
  const muted = value === 0 && delta === 0
  const trendColor = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : brandColor
  return (
    <Card bodyStyle={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Statistic
            title={title}
            value={value}
            valueStyle={
              muted
                ? { color: 'var(--a-text-tertiary)', fontWeight: 400 }
                : undefined
            }
          />
          <DeltaTag delta={delta} muted={muted} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span style={{ color: 'var(--a-text-quaternary)', fontSize: 14 }}>{icon}</span>
          <Sparkline data={spark} color={trendColor} muted={muted} />
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { effective } = useTheme()
  const { t } = useTranslation('dashboard')
  const brand = effective === 'dark' ? '#6366f1' : '#4f46e5'

  const kpis: KpiCardProps[] = [
    { title: t('kpi.users'), value: 0, icon: <UserOutlined />, delta: 0, spark: [2, 3, 2, 4, 3, 5, 4] },
    { title: t('kpi.groups'), value: 0, icon: <TeamOutlined />, delta: 0, spark: [1, 2, 3, 2, 4, 3, 5] },
    { title: t('kpi.spaces'), value: 0, icon: <AppstoreOutlined />, delta: 0, spark: [3, 3, 4, 3, 2, 3, 4] },
    { title: t('kpi.backups'), value: 0, icon: <CloudUploadOutlined />, delta: 0, spark: [1, 2, 2, 3, 3, 4, 4] },
  ]

  return (
    <div>
      <h1 className="page-title">{t('title')}</h1>
      <p className="page-subtitle">{t('subtitle')}</p>

      <div className="status-banner" role="status" aria-live="polite">
        <span className="status-dot" aria-hidden />
        <span>{t('status.normal')}</span>
        <span className="status-meta">{t('status.meta', { count: 0 })}</span>
      </div>

      <Row gutter={[16, 16]}>
        {kpis.map((k) => (
          <Col key={k.title} xs={24} sm={12} lg={6}>
            <KpiCard {...k} brandColor={brand} />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card title={t('activity.title')} bodyStyle={{ padding: 0 }}>
            <div className="empty-card" style={{ padding: '56px 20px' }}>
              <div className="empty-illust">
                <LineChartOutlined />
              </div>
              <div className="empty-title">{t('activity.empty.title')}</div>
              <div className="empty-hint-text">{t('activity.empty.hint')}</div>
              <a className="empty-cta" href="#/docs/analytics">
                {t('activity.empty.cta')}
              </a>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t('recent.title')} bodyStyle={{ padding: 0 }}>
            <div className="empty-card" style={{ padding: '56px 20px' }}>
              <div className="empty-illust">
                <UserOutlined />
              </div>
              <div className="empty-title">{t('recent.empty.title')}</div>
              <div className="empty-hint-text">{t('recent.empty.hint')}</div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
