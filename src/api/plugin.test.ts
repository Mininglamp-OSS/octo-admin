import { beforeEach, describe, expect, it, vi } from 'vitest'

const patch = vi.hoisted(() => vi.fn())
vi.mock('./marketplace', () => ({ marketplaceApi: { patch } }))

import { tryUpdatePluginRating, updatePluginRating } from './plugin'

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

  it('reports partial success without leaving a rejected default for later calls', async () => {
    patch.mockRejectedValueOnce(new Error('rating failed'))
    patch.mockResolvedValueOnce({})

    expect(await tryUpdatePluginRating('plugin-1', 4)).toBe(false)
    expect(await tryUpdatePluginRating('plugin-1', 5)).toBe(true)
  })
})
