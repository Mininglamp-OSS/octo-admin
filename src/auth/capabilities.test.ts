import { describe, expect, it } from 'vitest'
import {
  firstManagerPath,
  hasManagerCapability,
  normalizeManagerCapabilities,
} from './capabilities'

describe('manager capabilities', () => {
  it('normalizes missing capability keys to false', () => {
    const capabilities = normalizeManagerCapabilities({
      'dashboard.read': true,
      system_setting: false,
    })

    expect(capabilities['dashboard.read']).toBe(true)
    expect(capabilities.system_setting).toBe(false)
    expect(capabilities.backup).toBe(false)
  })

  it('checks capabilities strictly', () => {
    const capabilities = normalizeManagerCapabilities({
      'dashboard.read': 1,
      system_setting: true,
    })

    expect(hasManagerCapability(capabilities, 'dashboard.read')).toBe(false)
    expect(hasManagerCapability(capabilities, 'system_setting')).toBe(true)
  })

  it('selects the first readable manager path', () => {
    const capabilities = normalizeManagerCapabilities({
      'space.read': true,
      'appversion.read': true,
    })

    expect(firstManagerPath(capabilities)).toBe('/spaces')
  })
})
