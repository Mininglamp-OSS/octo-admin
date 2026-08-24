import axios, { AxiosError } from 'axios'
import i18n, { FALLBACK_LANGUAGE } from '../i18n'
import { useAuthStore } from '../store/auth'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * 跳过 401 的全局「清凭据 + 硬跳转登录页」处理，把结果交回调用方。
     *
     * **唯一被认可的调用方是登录页的会话探测**（pages/Login/useSessionRestore）。
     * 它需要区分「401 = token 确实失效」与「网络/5xx = 后端没表态」，后者必须
     * 保留 token 让用户重试 —— 全局处理把两者都当失效，而重新提交登录表单会在
     * 服务端新建一个 session，正是要避免的浪费。
     *
     * 撤销失效凭据是强制行为，这个开关会在两个 axios 实例上都把它关掉。除上述
     * 场景外要用它，得先说明为什么这个调用点可以不撤销。
     */
    skipAuthRedirect?: boolean
  }
}

export class ApiError extends Error {
  /**
   * 优先取自错误信封的 `error.http_status`，取不到才回落到传输层状态。
   * 现有调用方用它判 409 / 404 / 400 这类业务语义，语义保持不变。
   */
  status?: number
  /**
   * 传输层真实的 HTTP 状态码，不受错误信封影响。
   *
   * 两者会不一致，而且是 octo-server 有意为之：部分端点用
   * `httperr.ResponseErrorL` 渲染，为兼容老客户端把 wire 状态钉死在 400，
   * 真实状态只放进 `error.http_status`（见 octo-server
   * pkg/errcode/messages_search.go 的注释）。
   *
   * 所以「服务端是不是拒绝了这个凭据」只能问传输层状态 —— 那正是
   * 下面 401 拦截器的判据，两处必须用同一个答案。
   */
  transportStatus?: number
  code?: string
  details?: Record<string, unknown>
  constructor(
    message: string,
    status?: number,
    code?: string,
    details?: Record<string, unknown>,
    transportStatus?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.transportStatus = transportStatus ?? status
    this.code = code
    this.details = details
  }
}

/**
 * Manager login, including its MFA send/resend/verify steps, is intentionally
 * unauthenticated. A 401 from one of these endpoints is a login-flow error,
 * not an expired bearer session, so the global session redirect must not
 * destroy the challenge state before Login can render its error message.
 */
export function isManagerLoginRequest(url?: string): boolean {
  if (!url) return false
  const path = url.split(/[?#]/, 1)[0]
  return /(?:^|\/)v1\/manager\/login(?:\/|$)/.test(path)
}

export function shouldRedirectToLogin(
  error: AxiosError<unknown>,
  hasSessionToken: boolean = Boolean(useAuthStore.getState().token),
): boolean {
  return (
    error.response?.status === 401 &&
    hasSessionToken &&
    !error.config?.skipAuthRedirect &&
    !isManagerLoginRequest(error.config?.url)
  )
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

/**
 * Manager login, including its MFA send/resend/verify steps, is intentionally
 * unauthenticated. A 401 from one of these endpoints is a login-flow error,
 * not an expired bearer session, so the global session redirect must not
 * destroy the challenge state before Login can render its error message.
 */
export function isManagerLoginRequest(url?: string): boolean {
  if (!url) return false
  const path = url.split(/[?#]/, 1)[0]
  return /(?:^|\/)v1\/manager\/login(?:\/|$)/.test(path)
}

export function shouldRedirectToLogin(
  error: AxiosError<unknown>,
  hasSessionToken: boolean = Boolean(useAuthStore.getState().token),
): boolean {
  return (
    error.response?.status === 401 &&
    hasSessionToken &&
    !isManagerLoginRequest(error.config?.url)
  )
}

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
  (error: AxiosError<{ msg?: string; error?: { code?: string; http_status?: number; message?: string; details?: Record<string, unknown> } }>) => {
    if (shouldRedirectToLogin(error)) {
      useAuthStore.getState().logout()
      window.location.href = '/admin/login'
    }
    const errorEnvelope = error.response?.data?.error
    const message = errorEnvelope?.message || error.response?.data?.msg || error.message
    const status = errorEnvelope?.http_status ?? error.response?.status
    return Promise.reject(
      new ApiError(message, status, errorEnvelope?.code, errorEnvelope?.details, error.response?.status),
    )
  }
)

export default api
