import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Dropdown, Tooltip, Breadcrumb } from 'antd'
import type { MenuProps } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  UserOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CloudUploadOutlined,
  DownloadOutlined,
  LogoutOutlined,
  DashboardOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store/auth'
import { useFeatureStore } from '../store/feature'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useTheme } from '../hooks/useTheme'
import type { Theme } from '../hooks/useTheme'

const { Header, Sider, Content } = Layout

type MenuItem = { key: string; icon: React.ReactNode; label: string }

const themeIcon: Record<Theme, React.ReactNode> = {
  light: <SunOutlined />,
  dark: <MoonOutlined />,
  auto: <DesktopOutlined />,
}

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { name, logout } = useAuthStore()
  const { theme, effective, setTheme } = useTheme()
  const appBotsAvailable = useFeatureStore((s) => s.appBotsAvailable)
  const probeAppBots = useFeatureStore((s) => s.probeAppBots)
  const { t } = useTranslation(['nav', 'layout'])

  useEffect(() => {
    void probeAppBots()
  }, [probeAppBots])

  const themeLabel = useMemo<Record<Theme, string>>(
    () => ({
      light: t('layout:theme.light'),
      dark: t('layout:theme.dark'),
      auto: t('layout:theme.auto'),
    }),
    [t],
  )

  const menuItems = useMemo<MenuItem[]>(() => {
    const base: MenuItem[] = [
      { key: '/dashboard', icon: <DashboardOutlined />, label: t('nav:dashboard') },
      { key: '/users', icon: <UserOutlined />, label: t('nav:users') },
      { key: '/groups', icon: <TeamOutlined />, label: t('nav:groups') },
      { key: '/spaces', icon: <AppstoreOutlined />, label: t('nav:spaces') },
    ]
    const tail: MenuItem[] = [
      { key: '/system-setting', icon: <SettingOutlined />, label: t('nav:systemSetting') },
      { key: '/backup', icon: <CloudUploadOutlined />, label: t('nav:backup') },
      { key: '/download', icon: <DownloadOutlined />, label: t('nav:download') },
    ]
    return appBotsAvailable === true
      ? [...base, { key: '/app-bots', icon: <RobotOutlined />, label: t('nav:appBots') }, ...tail]
      : [...base, ...tail]
  }, [appBotsAvailable, t])

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const activeItem = menuItems.find((item) => item.key === location.pathname)

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

  return (
    <Layout className="admin-shell" style={{ minHeight: '100vh', background: canvas }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={220}
        style={{ background: surface, borderRight: `1px solid ${border}` }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 16px',
            borderBottom: `1px solid ${border}`,
          }}
        >
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
              flexShrink: 0,
            }}
          >
            O
          </div>
          {!collapsed && (
            <span style={{ marginLeft: 10, fontSize: 15, fontWeight: 600, color: textPrimary, letterSpacing: '-0.01em' }}>
              Octo
            </span>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: 0, paddingTop: 8, background: 'transparent' }}
        />
      </Sider>
      <Layout style={{ background: canvas }}>
        <Header
          style={{
            height: 56,
            lineHeight: '56px',
            padding: '0 20px',
            background: surface,
            display: 'flex',
            alignItems: 'center',
            borderBottom: `1px solid ${border}`,
          }}
        >
          <Breadcrumb
            items={[
              {
                title: (
                  <a
                    onClick={(e) => {
                      e.preventDefault()
                      navigate('/dashboard')
                    }}
                    href="/dashboard"
                  >
                    {t('layout:breadcrumb.admin')}
                  </a>
                ),
              },
              { title: activeItem?.label ?? '' },
            ]}
          />
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <LanguageSwitcher />
            <Dropdown
              menu={{ items: themeMenu, selectedKeys: [theme] }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Tooltip title={t('layout:theme.tooltip', { name: themeLabel[theme] })}>
                <button className="admin-header-action" aria-label={t('layout:theme.label')}>
                  <span style={{ fontSize: 18 }}>{themeIcon[theme]}</span>
                </button>
              </Tooltip>
            </Dropdown>
            <span
              aria-hidden
              style={{
                width: 1,
                height: 18,
                background: border,
                margin: '0 6px',
              }}
            />
            <Tooltip title={t('layout:header.notifications')}>
              <button className="admin-header-action" aria-label={t('layout:header.notifications')}>
                <BellOutlined style={{ fontSize: 18 }} />
              </button>
            </Tooltip>
            <Tooltip title={t('layout:header.help')}>
              <button className="admin-header-action" aria-label={t('layout:header.help')}>
                <QuestionCircleOutlined style={{ fontSize: 18 }} />
              </button>
            </Tooltip>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: t('layout:header.logout'),
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
                  style={{
                    background: isDark ? '#6366f1' : '#4f46e5',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {name ? name.trim().charAt(0) : <UserOutlined />}
                </Avatar>
                <span style={{ fontWeight: 500, color: textPrimary, fontSize: 13 }}>{name}</span>
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
            boxShadow: isDark
              ? '0 1px 2px rgba(0,0,0,0.3)'
              : '0 1px 2px rgba(16,24,40,0.05)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
