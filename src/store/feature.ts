import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api, { ApiError } from '../api'

// 应用 Bot 模块按后端能力开关。
// 成功 / 404（路由未注册）→ 缓存 10 分钟。
// 5xx / 网络错误（瞬态）→ 仅缓存 30 秒，避免一次启动 race 把菜单卡死 10 分钟，
// 同时防止持续故障时每次组件 mount 都打请求。
export const APP_BOTS_TTL_MS = 10 * 60 * 1000
export const APP_BOTS_TRANSIENT_TTL_MS = 30 * 1000

interface FeatureState {
  appBotsAvailable: boolean | null
  appBotsCheckedAt: number
  appBotsCheckTtl: number
  probeAppBots: (force?: boolean) => Promise<void>
  resetFeatures: () => void
}

function isFresh(checkedAt: number, ttl: number): boolean {
  return checkedAt > 0 && Date.now() - checkedAt < ttl
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set, get) => ({
      appBotsAvailable: null,
      appBotsCheckedAt: 0,
      appBotsCheckTtl: APP_BOTS_TTL_MS,
      probeAppBots: async (force = false) => {
        const { appBotsAvailable, appBotsCheckedAt, appBotsCheckTtl } = get()
        if (!force && appBotsAvailable !== null && isFresh(appBotsCheckedAt, appBotsCheckTtl)) {
          return
        }
        try {
          await api.get('/v1/app_bot/available')
          set({
            appBotsAvailable: true,
            appBotsCheckedAt: Date.now(),
            appBotsCheckTtl: APP_BOTS_TTL_MS,
          })
        } catch (e) {
          // 401 已被 axios 拦截器处理为登出，此处不到达。
          // 仅 404 视为稳定信号（路由未注册），10 分钟内不再探测；
          // 其它一切——5xx、网络错误、超时、以及任何非 404 状态码——
          // 都按瞬态处理，30 秒后允许重试。本端点目前不会返回其它 4xx。
          const status = e instanceof ApiError ? e.status : undefined
          const transient = status !== 404
          set({
            appBotsAvailable: false,
            appBotsCheckedAt: Date.now(),
            appBotsCheckTtl: transient ? APP_BOTS_TRANSIENT_TTL_MS : APP_BOTS_TTL_MS,
          })
        }
      },
      resetFeatures: () =>
        set({ appBotsAvailable: null, appBotsCheckedAt: 0, appBotsCheckTtl: APP_BOTS_TTL_MS }),
    }),
    {
      name: 'dm-admin-features',
    },
  ),
)
