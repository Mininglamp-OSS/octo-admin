import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import type { Locale } from 'antd/es/locale'
import { useTranslation } from 'react-i18next'
import App from './App'
import './i18n'
import './styles/theme.css'
import './index.css'
import './styles/admin.css'

const ANTD_LOCALES: Record<string, Locale> = {
  'en-US': enUS,
  'zh-CN': zhCN,
}

function LocalizedApp() {
  const { i18n } = useTranslation()
  const locale = ANTD_LOCALES[i18n.language] ?? enUS
  return (
    <ConfigProvider locale={locale} button={{ autoInsertSpace: false }}>
      <App />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocalizedApp />
  </React.StrictMode>
)
