import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()

vi.mock('./marketplace', () => ({
  marketplaceApi: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}))

import { batchSetPluginPlacements, updatePluginScene } from './marketplace-scene'

describe('marketplace scene API', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    del.mockReset()
  })

  it('encodes scene ids and never attempts to mutate scene_code', async () => {
    patch.mockResolvedValue({ data: { data: { scene_id: 'scene/a' } } })
    const payload = { name: 'Featured', description: '', sort_order: 10 }
    await updatePluginScene('scene/a', payload)
    expect(patch).toHaveBeenCalledWith('/admin/plugin_scenes/scene%2Fa', payload)
  })

  it('sends one atomic batch placement request for selected plugins', async () => {
    post.mockResolvedValue({ data: { data: { items: [] } } })
    const payload = {
      scene_code: 'featured',
      plugin_ids: ['skill-1', 'skill-2'],
      is_placed: true,
      is_visible: true,
      sort_order: 100,
    }
    await batchSetPluginPlacements(payload)
    expect(post).toHaveBeenCalledWith('/admin/plugin_placements/_batch', payload)
  })

  it('uses the same atomic endpoint for a single-plugin removal', async () => {
    post.mockResolvedValue({ data: { data: { items: [] } } })
    const payload = {
      scene_code: 'featured',
      plugin_ids: ['skill-1'],
      is_placed: false,
    }

    await batchSetPluginPlacements(payload)

    expect(post).toHaveBeenCalledWith('/admin/plugin_placements/_batch', payload)
  })
})
