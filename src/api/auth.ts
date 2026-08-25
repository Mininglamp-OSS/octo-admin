import api from './index'
import { normalizeManagerCapabilities, type ManagerMe } from '../auth/capabilities'

interface LoginParams {
  username: string
  password: string
}

interface LoginResponse {
  token: string
  name: string
  role: string
}

interface ManagerMeOptions {
  /** 见 api/index.ts 的 skipAuthRedirect：由调用方自行处置 401。 */
  skipAuthRedirect?: boolean
  /** 覆盖实例默认的 30s 超时。登录页的会话探测是延迟优化，要快速失败。 */
  timeoutMs?: number
  /** 放弃探测时中止请求，避免迟到的响应把用户从表单上带走。 */
  signal?: AbortSignal
}

export const login = (params: LoginParams) =>
  api.post<LoginResponse>('/v1/manager/login', params).then((res) => res.data)

export const getManagerMe = (options: ManagerMeOptions = {}) =>
  api
    .get<ManagerMe>('/v1/manager/me', {
      skipAuthRedirect: options.skipAuthRedirect,
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      signal: options.signal,
    })
    .then((res) => ({
      ...res.data,
      capabilities: normalizeManagerCapabilities(res.data.capabilities),
    }))
