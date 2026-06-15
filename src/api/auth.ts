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

export const login = (params: LoginParams) =>
  api.post<LoginResponse>('/v1/manager/login', params).then((res) => res.data)

export const getManagerMe = () =>
  api.get<ManagerMe>('/v1/manager/me').then((res) => ({
    ...res.data,
    capabilities: normalizeManagerCapabilities(res.data.capabilities),
  }))
