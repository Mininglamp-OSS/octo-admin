import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  Layout,
  Avatar,
  Collapse,
  Descriptions,
  Dropdown,
  Tooltip,
  Tabs,
  Skeleton,
  Tag,
  message,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import InlineEditField from '../Spaces/InlineEditField'
import { updateSpaceUserProfile } from '../../api/space-user'
import { useAuthStore } from '../../store/auth'
import { useFeatureStore } from '../../store/feature'
import { useTheme, type Theme } from '../../hooks/useTheme'
import {
  getMySpaces,
  getSpaceUserDetail,
  type SpaceUserDetail,
} from '../../api/space-user'
import type { MySpace } from '../../store/auth'
import SpaceSwitcher from './SpaceSwitcher'
import LanguageSwitcher from '../../components/LanguageSwitcher'

const { Header, Content } = Layout

const themeIcon: Record<Theme, React.ReactNode> = {
  light: <SunOutlined />,
  dark: <MoonOutlined />,
  auto: <DesktopOutlined />,
}

const themeLabelKey: Record<Theme, string> = {
  light: 'theme.light',
  dark: 'theme.dark',
  auto: 'theme.auto',
}

const BASE_TAB_KEYS = ['members', 'invites', 'join-applies'] as const
type TabKey = (typeof BASE_TAB_KEYS)[number] | 'app-bots'

const TAB_LABEL_KEY: Record<TabKey, string> = {
  members: 'tab.members',
  invites: 'tab.invites',
  'join-applies': 'tab.joinApplies',
  'app-bots': 'tab.appBots',
}

function currentTabFromPath(pathname: string, visible: readonly TabKey[]): TabKey {
  const seg = pathname.split('/').pop() as TabKey
  return visible.includes(seg) ? seg : 'members'
}

export default function SpaceAdminLayout() {
  const { t } = useTranslation('spaceAdmin')
  const navigate = useNavigate()
  const location = useLocation()
  const { spaceId } = useParams<{ spaceId: string }>()
  const { name, mySpaces, currentSpaceId, setCurrentSpaceId, setMySpaces, logout } =
    useAuthStore()
  const appBotsAvailable = useFeatureStore((s) => s.appBotsAvailable)
  const probeAppBots = useFeatureStore((s) => s.probeAppBots)
  const { theme, effective, setTheme } = useTheme()

  useEffect(() => {
    void probeAppBots()
  }, [probeAppBots])

  const visibleTabKeys = useMemo<readonly TabKey[]>(
    () =>
      appBotsAvailable === true
        ? [...BASE_TAB_KEYS, 'app-bots']
        : [...BASE_TAB_KEYS],
    [appBotsAvailable],
  )
  const [detail, setDetail] = useState<SpaceUserDetail | null>(null)
  const [loading, setLoading] = useState(false)

  // 仅 owner(2) / admin(1) 且空间正常状态(1) 时可编辑
  const canEdit = !!detail && detail.role >= 1 && detail.status === 1
  // 与服务端 modules/space/api_manager.go 中的字符上限保持一致。
  const NAME_MAX = 100
  const DESC_MAX = 500
  const LOGO_MAX = 200
  const runeCount = (s: string) => Array.from(s).length

  const saveDetailField = async (
    patch: Parameters<typeof updateSpaceUserProfile>[1],
    apply: (d: SpaceUserDetail) => SpaceUserDetail,
  ) => {
    if (!detail) return
    await updateSpaceUserProfile(detail.space_id, patch)
    const next = apply(detail)
    setDetail(next)
    // 同步 mySpaces：name / logo 影响 SpaceSwitcher 显示；join_mode 当前不渲染但属于 MySpace
    // 类型字段，一并同步避免下游消费者拿到陈旧值。不同步则继续渲染旧值直到下次拉取 /space/my。
    if (
      patch.name !== undefined ||
      patch.logo !== undefined ||
      patch.join_mode !== undefined
    ) {
      setMySpaces(
        mySpaces.map((s) =>
          s.space_id === next.space_id
            ? { ...s, name: next.name, logo: next.logo, join_mode: next.join_mode }
            : s,
        ),
      )
    }
    message.success(t('toast.saved'))
  }

  // 每次挂载/spaceId 变化时强拉 /space/my,校验权限,防止 mySpaces 过期显示已退出的空间
  useEffect(() => {
    if (!spaceId) return
    let cancelled = false
    if (spaceId !== currentSpaceId) setCurrentSpaceId(spaceId)
    setLoading(true)
    Promise.all([
      getMySpaces().catch(() => [] as MySpace[]),
      getSpaceUserDetail(spaceId),
    ])
      .then(([list, d]) => {
        if (cancelled) return
        const managed = (list || []).filter((s) => s.role >= 1)
        setMySpaces(managed)
        if (!managed.some((s) => s.space_id === spaceId)) {
          // 当前 URL 里的 spaceId 已经不在可管理列表 → 回 entry
          navigate('/space', { replace: true })
          return
        }
        setDetail(d)
      })
      .catch((error: Error) => {
        if (!cancelled) message.error(error.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [spaceId, currentSpaceId, setCurrentSpaceId, setMySpaces, navigate])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isDark = effective === 'dark'
  const surface = isDark ? '#14171f' : '#ffffff'
  const border = isDark ? '#262b38' : '#e5e7eb'
  const canvas = isDark ? '#0b0d12' : '#f7f8fa'
  const textPrimary = isDark ? '#e6e8ec' : '#0f172a'

  const themeMenu: MenuProps['items'] = (['light', 'dark', 'auto'] as Theme[]).map((th) => ({
    key: th,
    icon: themeIcon[th],
    label: t(themeLabelKey[th]),
    onClick: () => setTheme(th),
  }))

  const activeTab = currentTabFromPath(location.pathname, visibleTabKeys)

  if (mySpaces.length === 0) {
    return (
      <Layout className="admin-shell" style={{ minHeight: '100vh', background: canvas }}>
        <Content style={{ padding: 40 }}>
          <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
            <h2 style={{ color: textPrimary }}>{t('empty.title')}</h2>
            <p style={{ color: 'var(--a-text-tertiary)' }}>
              {t('empty.desc')}
            </p>
            <a onClick={handleLogout} style={{ color: 'var(--a-brand)' }}>
              {t('empty.logout')}
            </a>
          </div>
        </Content>
      </Layout>
    )
  }

  return (
    <Layout className="admin-shell" style={{ minHeight: '100vh', background: canvas }}>
      <Header
        style={{
          height: 56,
          lineHeight: '56px',
          padding: '0 20px',
          background: surface,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          borderBottom: `1px solid ${border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {window.history.length > 1 && (
            <Tooltip title={t('header.back.tooltip')}>
              <button
                className="admin-header-action"
                aria-label={t('header.back.aria')}
                onClick={() => window.history.back()}
              >
                <ArrowLeftOutlined style={{ fontSize: 16 }} />
              </button>
            </Tooltip>
          )}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: isDark ? '#6366f1' : '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            O
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: textPrimary }}>
            {t('header.title')}
          </span>
        </div>
        <SpaceSwitcher />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <LanguageSwitcher />
          <Dropdown
            menu={{ items: themeMenu, selectedKeys: [theme] }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Tooltip title={t('header.theme.tooltip', { label: t(themeLabelKey[theme]) })}>
              <button className="admin-header-action" aria-label={t('header.theme.aria')}>
                <span style={{ fontSize: 18 }}>{themeIcon[theme]}</span>
              </button>
            </Tooltip>
          </Dropdown>
          <span aria-hidden style={{ width: 1, height: 18, background: border, margin: '0 6px' }} />
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: t('menu.logout'),
                  onClick: handleLogout,
                },
              ],
            }}
          >
            <div
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '4px 10px',
                borderRadius: 6,
                marginLeft: 6,
              }}
            >
              <Avatar
                size={28}
                icon={name ? undefined : <UserOutlined />}
                style={{
                  background: isDark ? '#6366f1' : '#4f46e5',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {name ? name.trim().charAt(0) : null}
              </Avatar>
              <span style={{ fontWeight: 500, color: textPrimary, fontSize: 13 }}>
                {name || t('header.defaultAdminName')}
              </span>
            </div>
          </Dropdown>
        </div>
      </Header>
      <Content
        style={{
          margin: 16,
          padding: 24,
          background: surface,
          borderRadius: 12,
          overflow: 'auto',
          border: `1px solid ${border}`,
          boxShadow: isDark ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(16,24,40,0.05)',
        }}
      >
        {loading || !detail ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          <>
            <div className="meta-inline">
              <span className="meta-title">{detail.name}</span>
              <Tag
                color={detail.join_mode === 0 ? 'default' : 'gold'}
                bordered={false}
                style={{ margin: 0 }}
              >
                {detail.join_mode === 0 ? t('joinMode.direct') : t('joinMode.approval')}
              </Tag>
              <span className="meta-sep" aria-hidden />
              <span>
                <span className="meta-label">{t('meta.members')}</span>
                <span className="cell-primary">{detail.member_count}</span>
                <span style={{ color: 'var(--a-text-tertiary)' }}>
                  {detail.max_users > 0 ? ` / ${detail.max_users}` : ` / ${t('meta.unlimited')}`}
                </span>
              </span>
              {detail.description && (
                <>
                  <span className="meta-sep" aria-hidden />
                  <span
                    style={{
                      color: 'var(--a-text-tertiary)',
                      maxWidth: 420,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={detail.description}
                  >
                    {detail.description}
                  </span>
                </>
              )}
            </div>

            <Collapse
              ghost
              size="small"
              style={{ marginTop: 8, marginBottom: 12 }}
              items={[
                {
                  key: 'info',
                  label: <span style={{ color: 'var(--a-text-tertiary)' }}>{t('info.title')}</span>,
                  children: (
                    <Descriptions
                      size="small"
                      column={2}
                      colon={false}
                      labelStyle={{
                        color: 'var(--a-text-tertiary)',
                        fontSize: 12,
                        fontWeight: 500,
                        width: 80,
                        padding: '6px 0',
                      }}
                      contentStyle={{ fontSize: 13, padding: '6px 0' }}
                    >
                      <Descriptions.Item label={t('field.name')}>
                        <InlineEditField
                          kind="text"
                          value={detail.name}
                          readOnly={!canEdit}
                          maxLength={NAME_MAX}
                          validate={(v) => {
                            const trimmed = String(v).trim()
                            if (!trimmed) return t('validate.nameRequired')
                            if (runeCount(trimmed) > NAME_MAX)
                              return t('validate.nameTooLong', { max: NAME_MAX })
                            return null
                          }}
                          onSave={(v) =>
                            saveDetailField({ name: String(v) }, (d) => ({ ...d, name: String(v) }))
                          }
                        />
                      </Descriptions.Item>
                      <Descriptions.Item label={t('field.joinMode')}>
                        <InlineEditField
                          kind="select"
                          value={detail.join_mode}
                          readOnly={!canEdit}
                          display={
                            detail.join_mode === 0 ? (
                              <span className="pill-outline neutral">{t('joinMode.direct')}</span>
                            ) : (
                              <span className="pill-outline warning">{t('joinMode.approval')}</span>
                            )
                          }
                          options={[
                            { value: 0, label: t('joinMode.direct') },
                            { value: 1, label: t('joinMode.approval') },
                          ]}
                          onSave={(v) => {
                            const jm = (Number(v) === 1 ? 1 : 0) as 0 | 1
                            return saveDetailField({ join_mode: jm }, (d) => ({
                              ...d,
                              join_mode: jm,
                            }))
                          }}
                        />
                      </Descriptions.Item>
                      <Descriptions.Item label={t('field.logo')} span={2}>
                        <InlineEditField
                          kind="text"
                          value={detail.logo}
                          readOnly={!canEdit}
                          maxLength={LOGO_MAX}
                          placeholder={t('field.logo.placeholder')}
                          emptyText={t('field.logo.empty')}
                          validate={(v) =>
                            runeCount(String(v)) > LOGO_MAX
                              ? t('validate.logoTooLong', { max: LOGO_MAX })
                              : null
                          }
                          onSave={(v) =>
                            saveDetailField({ logo: String(v) }, (d) => ({ ...d, logo: String(v) }))
                          }
                        />
                      </Descriptions.Item>
                      <Descriptions.Item label={t('field.description')} span={2}>
                        <InlineEditField
                          kind="textarea"
                          value={detail.description}
                          readOnly={!canEdit}
                          maxLength={DESC_MAX}
                          rows={3}
                          emptyText={t('field.description.empty')}
                          validate={(v) =>
                            runeCount(String(v).trim()) > DESC_MAX
                              ? t('validate.descriptionTooLong', { max: DESC_MAX })
                              : null
                          }
                          onSave={(v) =>
                            saveDetailField({ description: String(v) }, (d) => ({
                              ...d,
                              description: String(v),
                            }))
                          }
                        />
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
              ]}
            />

            <Tabs
              activeKey={activeTab}
              onChange={(k) => navigate(`/space/${spaceId}/${k}`)}
              items={visibleTabKeys.map((k) => ({ key: k, label: t(TAB_LABEL_KEY[k]) }))}
              destroyInactiveTabPane
              tabBarStyle={{ marginBottom: 16 }}
            />
            <Outlet context={{ detail }} />
          </>
        )}
      </Content>

    </Layout>
  )
}
