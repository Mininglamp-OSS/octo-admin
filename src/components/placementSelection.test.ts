import { describe, expect, it, vi } from 'vitest'
import { getChangedPlacementKeyword, limitPlacementSelection } from './placementSelection'

describe('limitPlacementSelection', () => {
  it('keeps the first 100 selections and warns when the limit is exceeded', () => {
    const warn = vi.fn()
    const keys = Array.from({ length: 110 }, (_, index) => `plugin-${index}`)

    expect(limitPlacementSelection(keys, warn)).toEqual(keys.slice(0, 100))
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('getChangedPlacementKeyword', () => {
  it('does not apply an unchanged keyword when the search input loses focus', () => {
    expect(getChangedPlacementKeyword(' existing ', 'existing')).toBeNull()
  })

  it('returns a trimmed changed keyword', () => {
    expect(getChangedPlacementKeyword(' next ', 'existing')).toBe('next')
  })
})
