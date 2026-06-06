import type { TFunction } from 'i18next'
import {
  SECRET_MASK,
  type SystemSettingItem,
  type SystemSettingUpdateItem,
} from '../../api/system-setting'

export type BoolFormValue = '' | '0' | '1'
export type SettingFormValue = string | number | null | undefined
export type SystemSettingFormValues = Record<string, SettingFormValue>

export const settingMapKey = (category: string, key: string) => `${category}.${key}`
export const settingFormName = (category: string, key: string) => settingMapKey(category, key)

const categoryTitleKeys: Record<string, string> = {
  login: 'category.login',
  register: 'category.register',
  space: 'category.space',
  sidebar: 'category.sidebar',
  support: 'category.support',
}

export function normaliseBoolValue(value: string): BoolFormValue {
  if (value === '1' || value === 'true' || value === 'TRUE') return '1'
  if (value === '0' || value === 'false' || value === 'FALSE') return '0'
  return ''
}

export function formValueToString(value: SettingFormValue) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function valuesToPayload(
  values: SystemSettingFormValues,
  items: SystemSettingItem[],
): SystemSettingUpdateItem[] {
  return items.map((item) => {
    const value = formValueToString(values[settingFormName(item.category, item.key)])
    const keepEncryptedValue =
      item.value_type === 'encrypted' && !value && (item.configured || item.value === SECRET_MASK)

    return {
      category: item.category,
      key: item.key,
      value: keepEncryptedValue ? SECRET_MASK : value,
    }
  })
}

export function valuesFromSettings(items: SystemSettingItem[]): SystemSettingFormValues {
  return items.reduce<SystemSettingFormValues>((values, item) => {
    const fieldName = settingFormName(item.category, item.key)
    values[fieldName] = item.value_type === 'encrypted' ? '' : item.value ?? ''
    if (item.value_type === 'bool') {
      values[fieldName] = normaliseBoolValue(formValueToString(values[fieldName]))
    }
    return values
  }, {})
}

export function categoryTitle(t: TFunction, category: string) {
  const titleKey = categoryTitleKeys[category]
  return titleKey ? t(titleKey) : t('category.generic', { category })
}

export function settingLabel(item: SystemSettingItem) {
  return item.description || item.key
}
