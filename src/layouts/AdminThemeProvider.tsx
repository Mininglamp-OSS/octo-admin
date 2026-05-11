// Copyright 2026 MININGLAMP Technology and the OCTO contributors
// SPDX-License-Identifier: Apache-2.0

import { ConfigProvider, theme as antdTheme } from 'antd'
import type { ReactNode } from 'react'
import { useTheme } from '../hooks/useTheme'

interface AdminThemeProviderProps {
  children: ReactNode
}

export default function AdminThemeProvider({ children }: AdminThemeProviderProps) {
  const { effective } = useTheme()
  const isDark = effective === 'dark'

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#6366f1' : '#4f46e5',
          colorBgContainer: isDark ? '#14171f' : '#ffffff',
          colorBgElevated: isDark ? '#1b1f2a' : '#ffffff',
          colorBgLayout: isDark ? '#0b0d12' : '#f7f8fa',
          colorBorder: isDark ? '#262b38' : '#e5e7eb',
          colorBorderSecondary: isDark ? '#262b38' : '#e5e7eb',
          colorText: isDark ? '#e6e8ec' : '#0f172a',
          colorTextSecondary: isDark ? '#a1a7b3' : '#475569',
          colorTextTertiary: isDark ? '#6b7280' : '#94a3b8',
          colorError: isDark ? '#f87171' : '#ef4444',
          colorSuccess: isDark ? '#34d399' : '#10b981',
          colorWarning: isDark ? '#fbbf24' : '#f59e0b',
          fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', system-ui, sans-serif",
          fontSize: 13,
          borderRadius: 6,
          borderRadiusLG: 8,
          wireframe: false,
        },
      }}
    >
      {children}
    </ConfigProvider>
  )
}
