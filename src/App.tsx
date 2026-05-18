import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import { useFeatureStore } from './store/feature'
import MainLayout from './layouts/MainLayout'
import AdminThemeProvider from './layouts/AdminThemeProvider'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Groups from './pages/Groups'
import Spaces from './pages/Spaces'
import Backup from './pages/Backup'
import Download from './pages/Download'
import SystemSetting from './pages/SystemSetting'
import Changelog from './pages/Changelog'
import AppBots from './pages/AppBots'
import SpaceEntry from './pages/SpaceAdmin/SpaceEntry'
import SpaceAdminLayout from './pages/SpaceAdmin/SpaceAdminLayout'
import { MembersTab, InvitesTab, JoinAppliesTab, AppBotsTab } from './pages/SpaceAdmin/tabs'

function SuperOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, scope } = useAuthStore()
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (scope !== 'super') return <Navigate to="/space" replace />
  return <>{children}</>
}

function SpaceOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, scope } = useAuthStore()
  if (!isLoggedIn || scope !== 'space') return <Navigate to="/space" replace />
  return <>{children}</>
}

// 后端 GET /v1/app_bot/available 探测未通过时，重定向到回退路径。
// 探测尚未完成（null）时返回 null 避免闪烁。
function AppBotsGate({ fallback, children }: { fallback: string; children: React.ReactNode }) {
  const appBotsAvailable = useFeatureStore((s) => s.appBotsAvailable)
  if (appBotsAvailable === null) return null
  if (!appBotsAvailable) return <Navigate to={fallback} replace />
  return <>{children}</>
}

function SpaceAppBotsGate({ children }: { children: React.ReactNode }) {
  const { spaceId } = useParams<{ spaceId: string }>()
  return <AppBotsGate fallback={`/space/${spaceId}/members`}>{children}</AppBotsGate>
}

/**
 * 同一份 bundle 被挂到 /admin 和 /changelog 两个路径下(Docker 中 dist 双拷贝)。
 * 通过 pathname 前缀选择 basename 与路由树:
 * - /changelog → 只渲染 Changelog
 * - /admin(默认)→ 完整后台路由
 */
function detectBasename(): '/admin' | '/changelog' {
  if (typeof window === 'undefined') return '/admin'
  return window.location.pathname.startsWith('/changelog') ? '/changelog' : '/admin'
}

function AdminRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <AdminThemeProvider>
            <Login />
          </AdminThemeProvider>
        }
      />
      <Route
        path="/space"
        element={
          <AdminThemeProvider>
            <SpaceEntry />
          </AdminThemeProvider>
        }
      />
      <Route
        path="/space/:spaceId"
        element={
          <SpaceOnlyRoute>
            <AdminThemeProvider>
              <SpaceAdminLayout />
            </AdminThemeProvider>
          </SpaceOnlyRoute>
        }
      >
        <Route index element={<Navigate to="members" replace />} />
        <Route path="members" element={<MembersTab />} />
        <Route path="invites" element={<InvitesTab />} />
        <Route path="join-applies" element={<JoinAppliesTab />} />
        <Route
          path="app-bots"
          element={
            <SpaceAppBotsGate>
              <AppBotsTab />
            </SpaceAppBotsGate>
          }
        />
      </Route>
      <Route
        path="/"
        element={
          <SuperOnlyRoute>
            <AdminThemeProvider>
              <MainLayout />
            </AdminThemeProvider>
          </SuperOnlyRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="groups" element={<Groups />} />
        <Route path="spaces" element={<Spaces />} />
        <Route path="system-setting" element={<SystemSetting />} />
        <Route path="backup" element={<Backup />} />
        <Route path="download" element={<Download />} />
        <Route
          path="app-bots"
          element={
            <AppBotsGate fallback="/dashboard">
              <AppBots />
            </AppBotsGate>
          }
        />
      </Route>
    </Routes>
  )
}

function ChangelogRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Changelog />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  const basename = detectBasename()
  return (
    <BrowserRouter basename={basename}>
      {basename === '/changelog' ? <ChangelogRoutes /> : <AdminRoutes />}
    </BrowserRouter>
  )
}

export default App
