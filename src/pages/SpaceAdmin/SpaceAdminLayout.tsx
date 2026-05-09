import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  Layout,
  Avatar,
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
import { useAuthStore } from '../../store/auth'
import { useTheme, type Theme } from '../../hooks/useTheme'
import {
  getMySpaces,
  getSpaceUserDetail,
  type SpaceUserDetail,
} from '../../api/space-user'
import type { MySpace } from '../../store/auth'
import SpaceSwitcher from './SpaceSwitcher'

const { Header, Content } = Layout

const themeIcon: Record<Theme, React.ReactNode> = {
  light: <SunOutlined />,
  dark: <MoonOutlined />,
  auto: <DesktopOutlined />,
}

const themeLabel: Record<Theme, string> = {
  light: '浅色',
  dark: '深色',
  auto: '跟随系统',
}

const TAB_KEYS = ['members', 'invites', 'join-applies', 'app-bots'] as const
type TabKey = (typeof TAB_KEYS)[number]

const TAB_LABEL: Record<TabKey, string> = {
  members: '成员',
  invites: '邀请码',
  'join-applies': '加入申请',
  'app-bots': '应用 Bot',
}

function currentTabFromPath(pathname: string): TabKey {
  const seg = pathname.split('/').pop() as TabKey
  return TAB_KEYS.includes(seg) ? seg : 'members'
}

export default function SpaceAdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { spaceId } = useParams<{ spaceId: string }>()
  const { name, mySpaces, currentSpaceId, setCurrentSpaceId, setMySpaces, logout } =
    useAuthStore()
  const { theme, effective, setTheme } = useTheme()
  const [detail, setDetail] = useState<SpaceUserDetail | null>(null)
  const [loading, setLoading] = useState(false)

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

  const themeMenu: MenuProps['items'] = (['light', 'dark', 'auto'] as Theme[]).map((t) => ({
    key: t,
    icon: themeIcon[t],
    label: themeLabel[t],
    onClick: () => setTheme(t),
  }))

  const activeTab = currentTabFromPath(location.pathname)

  if (mySpaces.length === 0) {
    return (
      <Layout className="admin-shell" style={{ minHeight: '100vh', background: canvas }}>
        <Content style={{ padding: 40 }}>
          <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
            <h2 style={{ color: textPrimary }}>暂无可管理的空间</h2>
            <p style={{ color: 'var(--a-text-tertiary)' }}>
              你还不是任何空间的管理员或拥有者。请联系空间管理员邀请你，或先回到应用继续使用。
            </p>
            <a onClick={handleLogout} style={{ color: 'var(--a-brand)' }}>
              退出登录
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
            <Tooltip title="返回应用">
              <button
                className="admin-header-action"
                aria-label="返回"
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
            空间管理
          </span>
        </div>
        <SpaceSwitcher />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Dropdown
            menu={{ items: themeMenu, selectedKeys: [theme] }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Tooltip title={`主题：${themeLabel[theme]}`}>
              <button className="admin-header-action" aria-label="主题">
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
                  label: '退出登录',
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
                {name || '空间管理员'}
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
                {detail.join_mode === 0 ? '直接加入' : '需审批'}
              </Tag>
              <span className="meta-sep" aria-hidden />
              <span>
                <span className="meta-label">成员</span>
                <span className="cell-primary">{detail.member_count}</span>
                <span style={{ color: 'var(--a-text-tertiary)' }}>
                  {detail.max_users > 0 ? ` / ${detail.max_users}` : ' / 不限'}
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

            <Tabs
              activeKey={activeTab}
              onChange={(k) => navigate(`/space/${spaceId}/${k}`)}
              items={TAB_KEYS.map((k) => ({ key: k, label: TAB_LABEL[k] }))}
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
