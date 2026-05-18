import api from './index'

export type SystemSettingValueType = 'bool' | 'string' | 'int' | 'encrypted'

export interface SystemSettingItem {
  category: string
  key: string
  configured: boolean
  value: string
  effective_value: string
  value_type: SystemSettingValueType
  description: string
}

export interface SystemSettingSchemaItem {
  category: string
  key: string
  type: SystemSettingValueType
  description: string
}

export interface SystemSettingResponse {
  items: SystemSettingItem[]
  schema: SystemSettingSchemaItem[]
}

export interface SystemSettingUpdateItem {
  category: string
  key: string
  value: string
}

export const SECRET_MASK = '****'

export const getSystemSettings = () =>
  api.get<SystemSettingResponse>('/v1/manager/common/system_setting').then((res) => res.data)

export const updateSystemSettings = (items: SystemSettingUpdateItem[]) =>
  api.post('/v1/manager/common/system_setting', { items })

export const testSystemSettingEmail = (to: string) =>
  api.post('/v1/manager/common/system_setting/test_email', { to })
