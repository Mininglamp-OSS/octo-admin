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

/**
 * Group settings by category, preserving the order the backend returned them in.
 */
export function groupByCategory(items: SystemSettingItem[]): [string, SystemSettingItem[]][] {
  const groups = new Map<string, SystemSettingItem[]>()
  items.forEach((item) => {
    const group = groups.get(item.category) || []
    group.push(item)
    groups.set(item.category, group)
  })
  return Array.from(groups.entries())
}

const SENTENCE_ENDINGS = '；;。'
const BRACKETS_OPEN = '（(【['
const BRACKETS_CLOSE = '）)】]'

/**
 * Visible row title: the first sentence of the description, so long multi-clause
 * descriptions stay on one line (the full text lives in a tooltip). Separators
 * inside brackets are ignored — "…（默认关闭，客户端适配后显式开启）" must not be cut.
 * Falls back to the key when there is no description.
 */
export function settingSummary(item: SystemSettingItem): string {
  // A description that opens with a separator would otherwise yield an empty
  // first sentence, so drop any leading separators before scanning.
  const description = (item.description || '').trim().replace(/^[；;。\s]+/, '')
  if (!description) return item.key

  let depth = 0
  for (let i = 0; i < description.length; i += 1) {
    const char = description[i]
    if (BRACKETS_OPEN.includes(char)) depth += 1
    else if (BRACKETS_CLOSE.includes(char)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && SENTENCE_ENDINGS.includes(char)) {
      const head = description.slice(0, i).trim()
      if (head) return head
    }
  }
  return description
}

/** Case-insensitive match against the full key (`category.key`) and the description. */
export function matchesSettingQuery(item: SystemSettingItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    settingFormName(item.category, item.key).toLowerCase().includes(needle) ||
    (item.description || '').toLowerCase().includes(needle)
  )
}

/**
 * Field names whose form value differs from the value loaded from the server.
 * Drives the unsaved-count, the per-row marker and the "unsaved" nav group.
 *
 * Encrypted fields always load blank (the mask is never echoed back), so any
 * non-empty input counts as a change and a blank one never does.
 */
export function changedFieldNames(
  values: SystemSettingFormValues,
  items: SystemSettingItem[],
): string[] {
  return items
    .filter((item) => {
      const fieldName = settingFormName(item.category, item.key)
      const next = formValueToString(values[fieldName])
      if (item.value_type === 'encrypted') return next !== ''
      const previous =
        item.value_type === 'bool'
          ? normaliseBoolValue(item.value ?? '')
          : item.value ?? ''
      return next !== previous
    })
    .map((item) => settingFormName(item.category, item.key))
}
