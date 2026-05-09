import api from './index'

// --- Types ---

export type AppBotScope = 'platform' | 'space'
export type AppBotStatus = 0 | 1 | 2 // 0=draft 1=published 2=unpublished

export interface AppBot {
  id: string
  uid: string
  display_name: string
  description: string
  avatar: string
  welcome_msg: string
  scope: AppBotScope
  space_id: string | null
  status: AppBotStatus
  token?: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface AppBotListResp {
  count: number
  list: AppBot[]
}

export interface AppBotCreateReq {
  id: string
  display_name: string
  description?: string
  avatar?: string
  welcome_msg?: string
}

export interface AppBotCreateResp {
  id: string
  uid: string
  token: string
}

export interface AppBotUpdateReq {
  display_name?: string
  description?: string
  avatar?: string
  welcome_msg?: string
}

export interface TokenRotateResp {
  token: string
}

export interface ListParams {
  page_index?: number
  page_size?: number
  keyword?: string
  status?: number
}

// --- Helpers ---

const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data)

// --- Platform App Bot (Super Admin) ---

export const listAppBots = (params: ListParams = {}): Promise<AppBotListResp> =>
  unwrap(api.get<AppBotListResp>('/v1/admin/app_bot', { params }))

export const getAppBot = (id: string): Promise<AppBot> =>
  unwrap(api.get<AppBot>(`/v1/admin/app_bot/${id}`))

export const createAppBot = (data: AppBotCreateReq): Promise<AppBotCreateResp> =>
  unwrap(api.post<AppBotCreateResp>('/v1/admin/app_bot', data))

export const updateAppBot = (id: string, data: AppBotUpdateReq): Promise<void> =>
  api.put(`/v1/admin/app_bot/${id}`, data).then(() => undefined)

export const deleteAppBot = (id: string): Promise<void> =>
  api.delete(`/v1/admin/app_bot/${id}`).then(() => undefined)

export const rotateAppBotToken = (id: string): Promise<TokenRotateResp> =>
  unwrap(api.post<TokenRotateResp>(`/v1/admin/app_bot/${id}/token`))

export const publishAppBot = (id: string): Promise<void> =>
  api.post(`/v1/admin/app_bot/${id}/publish`).then(() => undefined)

export const unpublishAppBot = (id: string): Promise<void> =>
  api.post(`/v1/admin/app_bot/${id}/unpublish`).then(() => undefined)

// --- Space App Bot (Space Admin) ---

export const listSpaceAppBots = (spaceId: string, params: ListParams = {}): Promise<AppBotListResp> =>
  unwrap(api.get<AppBotListResp>(`/v1/space/${spaceId}/app_bot`, { params }))

export const getSpaceAppBot = (spaceId: string, id: string): Promise<AppBot> =>
  unwrap(api.get<AppBot>(`/v1/space/${spaceId}/app_bot/${id}`))

export const createSpaceAppBot = (spaceId: string, data: AppBotCreateReq): Promise<AppBotCreateResp> =>
  unwrap(api.post<AppBotCreateResp>(`/v1/space/${spaceId}/app_bot`, data))

export const updateSpaceAppBot = (spaceId: string, id: string, data: AppBotUpdateReq): Promise<void> =>
  api.put(`/v1/space/${spaceId}/app_bot/${id}`, data).then(() => undefined)

export const deleteSpaceAppBot = (spaceId: string, id: string): Promise<void> =>
  api.delete(`/v1/space/${spaceId}/app_bot/${id}`).then(() => undefined)

export const rotateSpaceAppBotToken = (spaceId: string, id: string): Promise<TokenRotateResp> =>
  unwrap(api.post<TokenRotateResp>(`/v1/space/${spaceId}/app_bot/${id}/token`))

export const publishSpaceAppBot = (spaceId: string, id: string): Promise<void> =>
  api.post(`/v1/space/${spaceId}/app_bot/${id}/publish`).then(() => undefined)

export const unpublishSpaceAppBot = (spaceId: string, id: string): Promise<void> =>
  api.post(`/v1/space/${spaceId}/app_bot/${id}/unpublish`).then(() => undefined)
