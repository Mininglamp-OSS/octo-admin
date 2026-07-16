/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxyTarget = env.VITE_PROXY_TARGET || 'https://api-test.example.com'
  // octo-marketplace lives outside the primary admin backend. Its dev port is
  // 8092 (see octo-marketplace/README.md). The frontend hits
  // /market/api/v1/*; nginx strips the /market prefix in prod, so we do the
  // same rewrite here in dev.
  const marketplaceTarget = env.VITE_MARKETPLACE_TARGET || 'http://127.0.0.1:8092'

  return {
    plugins: [react()],
    define: {
      __BUILD_TIME__: JSON.stringify(Date.now()),
    },
    base: command === 'build' ? '/admin/' : '/',
    test: {
      environment: 'jsdom',
      globals: false,
      include: ['src/**/*.test.{ts,tsx}'],
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
        },
        '/market/api': {
          target: marketplaceTarget,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/market/, ''),
        },
      },
    },
  }
})
