import axios, { AxiosError } from 'axios'
import i18n, { FALLBACK_LANGUAGE } from '../i18n'
import { useAuthStore } from '../store/auth'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * 跳过 401 的全局「清凭据 + 硬跳转登录页」处理，把结果交回调用方。
     *
     * 只给登录页的会话探测用：那里需要区分「401 = token 确实失效」与
     * 「网络/5xx = 后端没表态」，后者必须保留 token 让用户重试。全局处理
     * 把两者都当失效，而重新提交登录表单会在服务端新建一个 session，
     * 正是要避免的浪费。
     */
    skipAuthRedirect?: boolean
  }
}

export class ApiError extends Error {
  status?: number
  code?: string
  details?: Record<string, unknown>
  constructor(message: string, status?: number, code?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.token = token
  }
  config.headers['Accept-Language'] = i18n.resolvedLanguage ?? FALLBACK_LANGUAGE
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ msg?: string; error?: { code?: string; http_status?: number; message?: string } }>) => {
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
      useAuthStore.getState().logout()
      window.location.href = '/admin/login'
    }
    const errorEnvelope = error.response?.data?.error
    const message = errorEnvelope?.message || error.response?.data?.msg || error.message
    const status = errorEnvelope?.http_status ?? error.response?.status
    return Promise.reject(new ApiError(message, status, errorEnvelope?.code))
  }
)

export default api
