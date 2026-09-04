import { beforeEach, describe, expect, it, vi } from 'vitest'

const patch = vi.hoisted(() => vi.fn())
vi.mock('./marketplace', () => ({ marketplaceApi: { patch } }))

import { updatePluginRating } from './plugin'

describe('updatePluginRating', () => {
  beforeEach(() => patch.mockReset())

  it('uses the dedicated rating endpoint', async () => {
    patch.mockResolvedValue({})
    await updatePluginRating('plugin/a', 5)
    expect(patch).toHaveBeenCalledWith('/admin/plugins/plugin%2Fa/rating', { rating: 5 })
  })

  it('clears a rating with null', async () => {
    patch.mockResolvedValue({})
    await updatePluginRating('plugin-1', null)
    expect(patch).toHaveBeenCalledWith('/admin/plugins/plugin-1/rating', { rating: null })
  })

  it.each([0, 6, 4.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid rating %s before sending a request',
    async (rating) => {
      await expect(updatePluginRating('plugin-1', rating)).rejects.toThrow(RangeError)
      expect(patch).not.toHaveBeenCalled()
    },
  )
})
