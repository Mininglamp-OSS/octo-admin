import { describe, expect, it } from 'vitest'
import { mergeRatingOverrides, recordRatingOverride } from './ratingOverrides'

type Row = { id: string; name: string; rating: number | null }

describe('rating overrides', () => {
  it('keeps a committed rating when an in-flight stale snapshot lands later', () => {
    const overrides = new Map<string, number | null>()
    recordRatingOverride(overrides, 'a', 5)

    expect(mergeRatingOverrides<Row>([
      { id: 'a', name: 'stale', rating: 2 },
    ], overrides, (row) => row.id)).toEqual([
      { id: 'a', name: 'stale', rating: 5 },
    ])
    expect(overrides.get('a')).toBe(5)
  })

  it('preserves search and pagination results instead of merging old rows', () => {
    const overrides = new Map<string, number | null>([['a', 4]])
    const page = [
      { id: 'b', name: 'search result', rating: 3 },
      { id: 'c', name: 'next page', rating: null },
    ]

    const merged = mergeRatingOverrides(page, overrides, (row) => row.id)

    expect(merged).toEqual(page)
    expect(merged).toHaveLength(2)
    expect(overrides.get('a')).toBe(4)
  })

  it('drops an override after the server response confirms it', () => {
    const overrides = new Map<string, number | null>([['a', null]])
    const row = { id: 'a', name: 'confirmed', rating: null }

    expect(mergeRatingOverrides([row], overrides, (item) => item.id)[0]).toBe(row)
    expect(overrides.has('a')).toBe(false)
  })
})
