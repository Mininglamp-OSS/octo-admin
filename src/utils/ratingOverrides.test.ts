import { describe, expect, it } from 'vitest'
import {
  createRatingOverrideLedger,
  mergeRatingOverrides,
  ratingOverrideSequence,
  recordRatingOverride,
} from './ratingOverrides'

type Row = { id: string; name: string; rating: number | null }

describe('rating overrides', () => {
  it('keeps a committed rating when it was written after the request started', () => {
    const ledger = createRatingOverrideLedger()
    const seenSequence = ratingOverrideSequence(ledger)
    recordRatingOverride(ledger, 'a', 5)

    expect(mergeRatingOverrides<Row>([
      { id: 'a', name: 'stale', rating: 2 },
    ], ledger, seenSequence, (row) => row.id)).toEqual([
      { id: 'a', name: 'stale', rating: 5 },
    ])
    expect(ledger.overrides.get('a')?.rating).toBe(5)
  })

  it('trusts the server and clears an override written before the request', () => {
    const ledger = createRatingOverrideLedger()
    recordRatingOverride(ledger, 'a', 5)
    const seenSequence = ratingOverrideSequence(ledger)
    const row = { id: 'a', name: 'authoritative', rating: 2 }

    expect(mergeRatingOverrides([row], ledger, seenSequence, (item) => item.id)[0]).toBe(row)
    expect(ledger.overrides.has('a')).toBe(false)
  })

  it('uses the newest write when multiple mutations race one response', () => {
    const ledger = createRatingOverrideLedger()
    recordRatingOverride(ledger, 'a', 3)
    const seenSequence = ratingOverrideSequence(ledger)
    recordRatingOverride(ledger, 'a', 4)
    recordRatingOverride(ledger, 'a', 5)

    const merged = mergeRatingOverrides(
      [{ id: 'a', name: 'stale', rating: 3 }],
      ledger,
      seenSequence,
      (row) => row.id,
    )
    expect(merged[0].rating).toBe(5)
  })

  it('preserves search results and unrelated overrides', () => {
    const ledger = createRatingOverrideLedger()
    recordRatingOverride(ledger, 'a', 4)
    const seenSequence = ratingOverrideSequence(ledger)
    const page = [{ id: 'b', name: 'search result', rating: 3 }]

    expect(mergeRatingOverrides(page, ledger, seenSequence, (row) => row.id)).toEqual(page)
    expect(ledger.overrides.get('a')?.rating).toBe(4)
  })
})
