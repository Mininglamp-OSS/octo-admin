/**
 * Unit coverage for the two pure helpers powering octo-admin's system-MCP
 * KvEditor + error surfacing:
 *
 *   1. `entriesFromWire` / `entriesToWire` — the round-trip between the wire
 *      pair (values map + user_supplied[]) and the structured KV rows the
 *      form drives.
 *   2. `describeApiError` — unpacks the marketplace error envelope so an
 *      operator sees which row got rejected instead of the generic
 *      "Secret value must not be submitted".
 *
 * Dragging the whole 3-step wizard into JSDOM adds no signal — these are
 * where the interesting branches live.
 */

import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import {
  describeApiError,
  entriesFromWire,
  entriesToWire,
} from './FormModal'

describe('entriesFromWire', () => {
  it('returns [] for a nil map', () => {
    expect(entriesFromWire(undefined, undefined)).toEqual([])
  })

  it('marks keys listed in user_supplied and passes others through as shared', () => {
    const rows = entriesFromWire(
      { Authorization: '', 'X-Trace': 'web' },
      ['Authorization'],
    )
    expect(rows).toEqual([
      { key: 'Authorization', value: '', userSupplied: true },
      { key: 'X-Trace', value: 'web', userSupplied: false },
    ])
  })

  it('unconditionally strips the sentinel back to "" even without a user_supplied flag', () => {
    // Legacy records may have persisted the sentinel literal before the
    // §5.1 relaxation. Rendering "__OCTO_SECRET_..." in a shared-value
    // input would be actively harmful; strip regardless.
    const rows = entriesFromWire(
      { Cookie: '__OCTO_SECRET_PLACEHOLDER__' },
      undefined,
    )
    expect(rows).toEqual([
      { key: 'Cookie', value: '', userSupplied: false },
    ])
  })

  it('preserves a real value under a user_supplied key (owner round-trip)', () => {
    // Since the §5.1 relaxation, user_supplied slots can carry a real
    // owner-only reference value. Rehydrate must not blank it or the
    // operator sees the value disappear on save.
    const rows = entriesFromWire(
      { Authorization: 'Bearer real' },
      ['Authorization'],
    )
    expect(rows).toEqual([
      { key: 'Authorization', value: 'Bearer real', userSupplied: true },
    ])
  })

  it('surfaces a user_supplied key even when the values map omits it (defensive)', () => {
    // Empty-collapse edge case: if the backend ever ships headers_user_supplied
    // without a matching entry in headers, we still want a toggle-ON row so
    // the operator can edit / clear it — otherwise the flag is invisible.
    const rows = entriesFromWire(undefined, ['Authorization'])
    expect(rows).toEqual([
      { key: 'Authorization', value: '', userSupplied: true },
    ])
  })
})

describe('entriesToWire', () => {
  it('always returns a concrete {values, userSupplied} pair — even for empty entries', () => {
    // Regression against review B1: returning `undefined` here would let a
    // "delete every row" PATCH silently no-op because backend's nil-means-
    // untouched rule preserves the persisted map. The wire needs to see
    // `env: {}` for a genuine clear.
    expect(entriesToWire([])).toEqual({ values: {}, userSupplied: [] })
  })

  it('drops rows with an empty (or whitespace-only) key', () => {
    const out = entriesToWire([
      { key: '', value: 'v', userSupplied: false },
      { key: '   ', value: 'v', userSupplied: true },
      { key: 'X-Trace', value: 'web', userSupplied: false },
    ])
    expect(out.values).toEqual({ 'X-Trace': 'web' })
    expect(out.userSupplied).toEqual([])
  })

  it('groups keys into (values, userSupplied) preserving order and real values', () => {
    const out = entriesToWire([
      { key: 'Authorization', value: 'Bearer real', userSupplied: true },
      { key: 'X-Trace', value: 'web', userSupplied: false },
      { key: 'X-Api-Key', value: '', userSupplied: true },
    ])
    expect(out.values).toEqual({
      Authorization: 'Bearer real',
      'X-Trace': 'web',
      'X-Api-Key': '',
    })
    expect(out.userSupplied).toEqual(['Authorization', 'X-Api-Key'])
  })
})

describe('describeApiError', () => {
  const fallback = 'Save failed'

  it('returns the fallback for non-ApiError values', () => {
    expect(describeApiError(new Error('random'), fallback)).toBe(fallback)
    expect(describeApiError('boom', fallback)).toBe(fallback)
    expect(describeApiError(undefined, fallback)).toBe(fallback)
  })

  it('returns the raw message when no details are attached', () => {
    const err = new ApiError('Something failed', 400, 'VALIDATION_ERROR')
    expect(describeApiError(err, fallback)).toBe('Something failed')
  })

  it('unpacks a single-violation detail block naming the offending field', () => {
    const err = new ApiError(
      'Secret value must not be submitted',
      400,
      'VALIDATION_ERROR',
      { field: 'headers.Authorization', reason: 'public_secret_disallowed' },
    )
    expect(describeApiError(err, fallback)).toBe(
      'Secret value must not be submitted: headers.Authorization (public_secret_disallowed)',
    )
  })

  it('unpacks a multi-violation detail block', () => {
    const err = new ApiError(
      'Secret value must not be submitted',
      400,
      'VALIDATION_ERROR',
      {
        violations: [
          { field: 'headers.Authorization', reason: 'must_be_empty' },
          { field: 'env.DB_PASSWORD', reason: 'public_secret_disallowed' },
        ],
      },
    )
    expect(describeApiError(err, fallback)).toBe(
      'Secret value must not be submitted: headers.Authorization (must_be_empty), env.DB_PASSWORD (public_secret_disallowed)',
    )
  })
})
