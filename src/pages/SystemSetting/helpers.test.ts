import { describe, expect, it } from 'vitest'
import { SECRET_MASK, type SystemSettingItem } from '../../api/system-setting'
import {
  settingFormName,
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
