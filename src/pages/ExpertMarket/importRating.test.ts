import { describe, expect, it, vi } from 'vitest'
import { importThenRate } from './importRating'

describe('importThenRate', () => {
  it('imports then assigns the selected rating', async () => {
    const importPlugin = vi.fn().mockResolvedValue({ plugin_id: 'expert-1' })
    const setRating = vi.fn().mockResolvedValue(undefined)
    await expect(importThenRate(undefined, 5, importPlugin, setRating)).resolves.toEqual({
      pluginId: 'expert-1', imported: true, ratingFailed: false,
    })
    expect(setRating).toHaveBeenCalledWith('expert-1', 5)
  })

  it('reports partial success while retaining the created plugin id', async () => {
    const importPlugin = vi.fn().mockResolvedValue({ plugin_id: 'expert-2' })
    const setRating = vi.fn().mockRejectedValue(new Error('rating failed'))
    await expect(importThenRate(undefined, 4, importPlugin, setRating)).resolves.toEqual({
      pluginId: 'expert-2', imported: true, ratingFailed: true,
    })
  })

  it('retries only rating when a previous import already succeeded', async () => {
    const importPlugin = vi.fn()
    const setRating = vi.fn().mockResolvedValue(undefined)
    await expect(importThenRate('expert-2', 4, importPlugin, setRating)).resolves.toEqual({
      pluginId: 'expert-2', imported: false, ratingFailed: false,
    })
    expect(importPlugin).not.toHaveBeenCalled()
    expect(setRating).toHaveBeenCalledWith('expert-2', 4)
  })
})
