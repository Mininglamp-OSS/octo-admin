import { describe, expect, it } from 'vitest'
import {
  getResendCooldownSeconds,
  minimumResendCooldownSeconds,
} from './cooldown'

describe('manager login resend cooldown', () => {
  it('allows the first explicit send when the server returns zero', () => {
    expect(getResendCooldownSeconds(0, false)).toBe(0)
  })

  it('uses the two-minute UI minimum for a shorter server cooldown', () => {
    expect(getResendCooldownSeconds(60, true)).toBe(minimumResendCooldownSeconds)
  })

  it('honors a longer server cooldown', () => {
    expect(getResendCooldownSeconds(180, true)).toBe(180)
  })

  it('starts a cooldown when a sent response omits an invalid value', () => {
    expect(getResendCooldownSeconds(undefined, true)).toBe(minimumResendCooldownSeconds)
    expect(getResendCooldownSeconds(Number.NaN, true)).toBe(minimumResendCooldownSeconds)
  })

  it('honors a positive cooldown on a newly created challenge', () => {
    expect(getResendCooldownSeconds(60, false)).toBe(minimumResendCooldownSeconds)
  })
})
