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
}

export const login = (params: LoginParams) =>
  api.post<LoginResponse>('/v1/manager/login', params).then((res) => res.data)

export const getManagerMe = (options: ManagerMeOptions = {}) =>
  api
    .get<ManagerMe>('/v1/manager/me', { skipAuthRedirect: options.skipAuthRedirect })
    .then((res) => ({
      ...res.data,
      capabilities: normalizeManagerCapabilities(res.data.capabilities),
    }))
