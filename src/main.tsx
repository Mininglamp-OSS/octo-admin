// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Octo Contributors

import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/theme.css'
import './index.css'
import './styles/admin.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
