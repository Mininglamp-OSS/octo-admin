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

// 空间控制台自有登录（普通用户身份）。此前空间控制台没有登录入口，只能寄生于同一
// 标签页 sessionStorage 里恰好存在的 IM 会话 token —— 换标签页就进不去，且与超管会话互斥。
// 服务端 /v1/user/login 是 IM Web 用的同一个端点，空间管理员用自己的账号登录即可。
export interface UserLoginResponse {
  token: string
  uid: string
  name: string
  username?: string
}

export const userLogin = (params: LoginParams) =>
  api
    .post<UserLoginResponse>('/v1/user/login', { ...params, flag: 1 })
    .then((res) => res.data)

export const getManagerMe = () =>
  api.get<ManagerMe>('/v1/manager/me').then((res) => ({
    ...res.data,
    capabilities: normalizeManagerCapabilities(res.data.capabilities),
  }))
