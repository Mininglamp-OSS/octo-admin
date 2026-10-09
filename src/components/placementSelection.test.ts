import { describe, expect, it, vi } from 'vitest'
import { limitPlacementSelection } from './placementSelection'

describe('limitPlacementSelection', () => {
  it('keeps the first 100 selections and warns when the limit is exceeded', () => {
    const warn = vi.fn()
    const keys = Array.from({ length: 110 }, (_, index) => `plugin-${index}`)

    expect(limitPlacementSelection(keys, warn)).toEqual(keys.slice(0, 100))
    expect(warn).toHaveBeenCalledOnce()
  })
})
