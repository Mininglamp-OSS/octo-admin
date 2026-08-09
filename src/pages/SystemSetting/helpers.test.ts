import { describe, expect, it } from 'vitest'
import { SECRET_MASK, type SystemSettingItem } from '../../api/system-setting'
import {
  changedFieldNames,
  groupByCategory,
  matchesSettingQuery,
  settingFormName,
  settingSummary,
  valuesFromSettings,
  valuesToPayload,
  type SystemSettingFormValues,
} from './helpers'

function makeItem(partial: Partial<SystemSettingItem> & Pick<SystemSettingItem, 'category' | 'key' | 'value_type'>): SystemSettingItem {
  return {
    configured: false,
    value: '',
    effective_value: '',
    description: '',
    ...partial,
  }
}

const name = (item: SystemSettingItem) => settingFormName(item.category, item.key)

describe('valuesFromSettings', () => {
  it('normalises bool values and never derives a value from effective_value', () => {
    const configuredOn = makeItem({ category: 'register', key: 'off', value_type: 'bool', configured: true, value: '1', effective_value: '1' })
    const followDefault = makeItem({ category: 'register', key: 'only_china', value_type: 'bool', configured: false, value: '', effective_value: '0' })
    const legacyTrue = makeItem({ category: 'register', key: 'username_on', value_type: 'bool', configured: true, value: 'true', effective_value: '1' })

    const values = valuesFromSettings([configuredOn, followDefault, legacyTrue])

    expect(values[name(configuredOn)]).toBe('1')
    // Not configured stays empty (follow default) — viewing must not pre-fill from effective_value.
    expect(values[name(followDefault)]).toBe('')
    expect(values[name(legacyTrue)]).toBe('1')
  })

  it('always blanks encrypted fields so the mask is never echoed back', () => {
    const secret = makeItem({ category: 'support', key: 'email_pwd', value_type: 'encrypted', configured: true, value: SECRET_MASK, effective_value: SECRET_MASK })
    const values = valuesFromSettings([secret])
    expect(values[name(secret)]).toBe('')
  })

  it('keeps int/string values verbatim', () => {
    const intItem = makeItem({ category: 'sidebar', key: 'recent_filter_group_days', value_type: 'int', configured: true, value: '3', effective_value: '3' })
    const strItem = makeItem({ category: 'support', key: 'email', value_type: 'string', configured: true, value: 'a@b.com', effective_value: 'a@b.com' })
    const values = valuesFromSettings([intItem, strItem])
    expect(values[name(intItem)]).toBe('3')
    expect(values[name(strItem)]).toBe('a@b.com')
  })
})

describe('valuesToPayload', () => {
  it('preserves the bool tri-state: follow-default vs explicit yes/no', () => {
    const followDefault = makeItem({ category: 'register', key: 'only_china', value_type: 'bool', configured: false, effective_value: '0' })
    const explicitOn = makeItem({ category: 'register', key: 'off', value_type: 'bool', configured: true, value: '1' })
    const explicitOff = makeItem({ category: 'login', key: 'local_off', value_type: 'bool', configured: true, value: '0' })
    const items = [followDefault, explicitOn, explicitOff]

    const values: SystemSettingFormValues = {
      [name(followDefault)]: '',
      [name(explicitOn)]: '1',
      [name(explicitOff)]: '0',
    }

    const payload = valuesToPayload(values, items)
    expect(payload.find((p) => p.key === 'only_china')?.value).toBe('')
    expect(payload.find((p) => p.key === 'off')?.value).toBe('1')
    expect(payload.find((p) => p.key === 'local_off')?.value).toBe('0')
  })

  it('keeps the current encrypted value when left blank, but follows default when never configured', () => {
    const keep = makeItem({ category: 'support', key: 'email_pwd', value_type: 'encrypted', configured: true, value: SECRET_MASK })
    const neverSet = makeItem({ category: 'support', key: 'email_pwd2', value_type: 'encrypted', configured: false })
    const items = [keep, neverSet]

    const payload = valuesToPayload({ [name(keep)]: '', [name(neverSet)]: '' }, items)
    expect(payload.find((p) => p.key === 'email_pwd')?.value).toBe(SECRET_MASK)
    expect(payload.find((p) => p.key === 'email_pwd2')?.value).toBe('')
  })

  it('writes a new encrypted value when provided', () => {
    const secret = makeItem({ category: 'support', key: 'email_pwd', value_type: 'encrypted', configured: true, value: SECRET_MASK })
    const payload = valuesToPayload({ [name(secret)]: 'new-secret' }, [secret])
    expect(payload[0].value).toBe('new-secret')
  })

  it('stringifies int values and treats empty as follow-default', () => {
    const intItem = makeItem({ category: 'sidebar', key: 'recent_filter_group_days', value_type: 'int' })
    const set = valuesToPayload({ [name(intItem)]: 5 }, [intItem])
    expect(set[0].value).toBe('5')
    const cleared = valuesToPayload({ [name(intItem)]: '' }, [intItem])
    expect(cleared[0].value).toBe('')
  })
})

describe('bool round-trip (load → toggle → reset)', () => {
  const item = makeItem({ category: 'register', key: 'off', value_type: 'bool', configured: true, value: '1', effective_value: '1' })
  const field = name(item)

  it('round-trips an explicit value through load and save', () => {
    const loaded = valuesFromSettings([item])
    expect(loaded[field]).toBe('1')
    expect(valuesToPayload(loaded, [item])[0].value).toBe('1')
  })

  it('a toggle (onChange) produces the opposite explicit value', () => {
    // BoolSwitch.onChange(next ? '1' : '0') — toggling off
    const toggledOff: SystemSettingFormValues = { [field]: '0' }
    expect(valuesToPayload(toggledOff, [item])[0].value).toBe('0')
  })

  it('reset-to-default clears the override back to follow-default', () => {
    // BoolSwitch reset link calls onChange('')
    const reset: SystemSettingFormValues = { [field]: '' }
    expect(valuesToPayload(reset, [item])[0].value).toBe('')
  })
})

describe('settingSummary', () => {
  it('cuts at the first sentence separator so long descriptions stay one line', () => {
    const item = makeItem({
      category: 'botcard',
      key: 'display_enabled',
      value_type: 'bool',
      description:
        'Bot 未单独配置时，是否允许其发送展示型 raw 卡片（octo/v1，Bot 自拼卡片 JSON）；受卡片总闸 OCTO_CARD_MESSAGE_ENABLED 支配，总闸关闭时本项无效',
    })
    expect(settingSummary(item)).toBe(
      'Bot 未单独配置时，是否允许其发送展示型 raw 卡片（octo/v1，Bot 自拼卡片 JSON）',
    )
  })

  it('ignores separators inside brackets', () => {
    const item = makeItem({
      category: 'login',
      key: 'scan_enabled',
      value_type: 'bool',
      description: '是否开启扫码登录（默认关闭；客户端适配后显式开启）',
    })
    expect(settingSummary(item)).toBe('是否开启扫码登录（默认关闭；客户端适配后显式开启）')
  })

  it('handles a full stop, an ASCII semicolon and question/exclamation marks', () => {
    const cn = makeItem({ category: 'a', key: 'b', value_type: 'string', description: '第一句。第二句' })
    const ascii = makeItem({ category: 'a', key: 'c', value_type: 'string', description: 'first; second' })
    const question = makeItem({ category: 'a', key: 'd', value_type: 'string', description: '是否开启？关闭后不再展示入口' })
    const bang = makeItem({ category: 'a', key: 'e', value_type: 'string', description: 'Danger! This wipes the cache' })
    expect(settingSummary(cn)).toBe('第一句')
    expect(settingSummary(ascii)).toBe('first')
    expect(settingSummary(question)).toBe('是否开启')
    expect(settingSummary(bang)).toBe('Danger')
  })

  it('never cuts on "." so versions, paths and emails survive', () => {
    const item = makeItem({
      category: 'support',
      key: 'email',
      value_type: 'string',
      description: '默认联系人 admin@example.com，卡片协议 octo/v1.2 起生效',
    })
    expect(settingSummary(item)).toBe('默认联系人 admin@example.com，卡片协议 octo/v1.2 起生效')
  })

  it('degrades to a longer title, never a wrong one, on malformed brackets', () => {
    // Depth is counted, not type-matched: a stray closer ends the bracket run…
    const mismatched = makeItem({ category: 'a', key: 'b', value_type: 'string', description: '标题（说明]；后续' })
    expect(settingSummary(mismatched)).toBe('标题（说明]')
    // …and an unclosed opener suppresses every later separator.
    const unclosed = makeItem({ category: 'a', key: 'c', value_type: 'string', description: '标题（未闭合；后续' })
    expect(settingSummary(unclosed)).toBe('标题（未闭合；后续')
    // A stray closer must not push depth negative and swallow the rest.
    const strayClose = makeItem({ category: 'a', key: 'd', value_type: 'string', description: '标题）说明；后续' })
    expect(settingSummary(strayClose)).toBe('标题）说明')
  })

  it('returns the description unchanged when there is no separator', () => {
    const item = makeItem({ category: 'register', key: 'off', value_type: 'bool', description: '是否关闭注册' })
    expect(settingSummary(item)).toBe('是否关闭注册')
  })

  it('falls back to the key when the description is empty or blank', () => {
    const empty = makeItem({ category: 'register', key: 'off', value_type: 'bool', description: '' })
    const blank = makeItem({ category: 'register', key: 'off', value_type: 'bool', description: '   ' })
    expect(settingSummary(empty)).toBe('off')
    expect(settingSummary(blank)).toBe('off')
  })

  it('skips a leading separator instead of returning an empty title', () => {
    const item = makeItem({ category: 'a', key: 'b', value_type: 'string', description: '；真正的说明' })
    expect(settingSummary(item)).toBe('真正的说明')
  })
})

describe('matchesSettingQuery', () => {
  const item = makeItem({
    category: 'support',
    key: 'email_host',
    value_type: 'string',
    description: 'SMTP 服务器地址',
  })

  it('matches the full key case-insensitively', () => {
    expect(matchesSettingQuery(item, 'support.email')).toBe(true)
    expect(matchesSettingQuery(item, 'EMAIL_HOST')).toBe(true)
  })

  it('matches the description', () => {
    expect(matchesSettingQuery(item, 'smtp')).toBe(true)
    expect(matchesSettingQuery(item, '服务器')).toBe(true)
  })

  it('treats an empty or whitespace-only query as "match everything"', () => {
    expect(matchesSettingQuery(item, '')).toBe(true)
    expect(matchesSettingQuery(item, '   ')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(matchesSettingQuery(item, 'sticker')).toBe(false)
  })
})

describe('groupByCategory', () => {
  it('groups while preserving the order the backend returned', () => {
    const items = [
      makeItem({ category: 'register', key: 'off', value_type: 'bool' }),
      makeItem({ category: 'login', key: 'local_off', value_type: 'bool' }),
      makeItem({ category: 'register', key: 'email_on', value_type: 'bool' }),
    ]
    const groups = groupByCategory(items)
    expect(groups.map(([category]) => category)).toEqual(['register', 'login'])
    expect(groups[0][1].map((i) => i.key)).toEqual(['off', 'email_on'])
  })

  it('returns an empty list for no items', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('changedFieldNames', () => {
  it('reports only fields that differ from the server value', () => {
    const untouched = makeItem({ category: 'register', key: 'off', value_type: 'bool', configured: true, value: '1' })
    const toggled = makeItem({ category: 'register', key: 'only_china', value_type: 'bool', value: '' })
    const items = [untouched, toggled]

    const changed = changedFieldNames(
      { [name(untouched)]: '1', [name(toggled)]: '1' },
      items,
    )
    expect(changed).toEqual(['register.only_china'])
  })

  it('normalises legacy bool values so "true" vs "1" is not a false positive', () => {
    const legacy = makeItem({ category: 'register', key: 'username_on', value_type: 'bool', configured: true, value: 'true' })
    expect(changedFieldNames({ [name(legacy)]: '1' }, [legacy])).toEqual([])
    expect(changedFieldNames({ [name(legacy)]: '0' }, [legacy])).toEqual(['register.username_on'])
  })

  it('counts a blank encrypted field as unchanged and any input as changed', () => {
    const secret = makeItem({ category: 'support', key: 'email_pwd', value_type: 'encrypted', configured: true, value: SECRET_MASK })
    expect(changedFieldNames({ [name(secret)]: '' }, [secret])).toEqual([])
    expect(changedFieldNames({ [name(secret)]: 'new' }, [secret])).toEqual(['support.email_pwd'])
  })

  it('compares int values as strings, so 5 and "5" are the same', () => {
    const intItem = makeItem({ category: 'sidebar', key: 'recent_filter_group_days', value_type: 'int', configured: true, value: '5' })
    expect(changedFieldNames({ [name(intItem)]: 5 }, [intItem])).toEqual([])
    expect(changedFieldNames({ [name(intItem)]: 6 }, [intItem])).toEqual(['sidebar.recent_filter_group_days'])
  })

  it('treats clearing a configured value as a change (back to follow-default)', () => {
    const intItem = makeItem({ category: 'sidebar', key: 'recent_filter_group_days', value_type: 'int', configured: true, value: '5' })
    expect(changedFieldNames({ [name(intItem)]: '' }, [intItem])).toEqual(['sidebar.recent_filter_group_days'])
  })

  it('is empty for a freshly loaded form (round-trips with valuesFromSettings)', () => {
    const items = [
      makeItem({ category: 'register', key: 'off', value_type: 'bool', configured: true, value: '1' }),
      makeItem({ category: 'register', key: 'username_on', value_type: 'bool', configured: true, value: 'true' }),
      makeItem({ category: 'support', key: 'email_pwd', value_type: 'encrypted', configured: true, value: SECRET_MASK }),
      makeItem({ category: 'support', key: 'email', value_type: 'string', configured: true, value: 'a@b.com' }),
      makeItem({ category: 'sidebar', key: 'recent_filter_group_days', value_type: 'int', configured: true, value: '3' }),
      makeItem({ category: 'login', key: 'local_off', value_type: 'bool', value: '' }),
    ]
    expect(changedFieldNames(valuesFromSettings(items), items)).toEqual([])
  })
})
