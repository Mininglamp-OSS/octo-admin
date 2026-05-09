import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Dropdown, Tooltip, Breadcrumb } from 'antd'
import type { MenuProps } from 'antd'
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
} from '@ant-design/icons'
import { useAuthStore } from '../store/auth'
import { useTheme } from '../hooks/useTheme'
import type { Theme } from '../hooks/useTheme'

const { Header, Sider, Content } = Layout

const menuItems: NonNullable<MenuProps['items']> = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <UserOutlined />, label: '用户管理' },
  { key: '/groups', icon: <TeamOutlined />, label: '群组管理' },
  { key: '/spaces', icon: <AppstoreOutlined />, label: 'Space 管理' },
  { key: '/app-bots', icon: <RobotOutlined />, label: '应用 Bot' },
  { key: '/backup', icon: <CloudUploadOutlined />, label: '备份管理' },
  { key: '/download', icon: <DownloadOutlined />, label: '下载配置' },
]

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

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { name, logout } = useAuthStore()
  const { theme, effective, setTheme } = useTheme()

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const activeItem = menuItems.find(
    (item): item is { key: string; icon: React.ReactNode; label: string } =>
      !!item && 'key' in item && item.key === location.pathname,
  )

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
                    管理后台
                  </a>
                ),
              },
              { title: activeItem?.label ?? '' },
            ]}
          />
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Dropdown
              menu={{ items: themeMenu, selectedKeys: [theme] }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Tooltip title={`主题:${themeLabel[theme]}`}>
                <button className="admin-header-action" aria-label="主题">
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
            <Tooltip title="通知">
              <button className="admin-header-action" aria-label="通知">
                <BellOutlined style={{ fontSize: 18 }} />
              </button>
            </Tooltip>
            <Tooltip title="帮助">
              <button className="admin-header-action" aria-label="帮助">
                <QuestionCircleOutlined style={{ fontSize: 18 }} />
              </button>
            </Tooltip>
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
