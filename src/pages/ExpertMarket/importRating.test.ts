import { describe, expect, it, vi } from 'vitest'
import { importResultNeedsReconcile, importThenRate } from './importRating'

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

  it('reconciles the list after a successful rating-only retry without counting a new import', async () => {
    const result = await importThenRate('expert-2', 4, vi.fn(), vi.fn().mockResolvedValue(undefined))

    expect(result.imported).toBe(false)
    expect(importResultNeedsReconcile(result)).toBe(true)
  })

  it('does not reconcile a rating-only retry that still failed', async () => {
    const result = await importThenRate('expert-2', 4, vi.fn(), vi.fn().mockRejectedValue(new Error('failed')))

    expect(importResultNeedsReconcile(result)).toBe(false)
  })
})
