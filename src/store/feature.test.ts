import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    default: { get: vi.fn() },
  }
})

import api, { ApiError } from '../api'
import { APP_BOTS_TRANSIENT_TTL_MS, APP_BOTS_TTL_MS, useFeatureStore } from './feature'

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  apiGet.mockReset()
  useFeatureStore.getState().resetFeatures()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-20T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useFeatureStore.probeAppBots', () => {
  it('caches success with the 10-minute TTL', async () => {
    apiGet.mockResolvedValueOnce({})

    await useFeatureStore.getState().probeAppBots()

    const s = useFeatureStore.getState()
    expect(s.appBotsAvailable).toBe(true)
    expect(s.appBotsCheckTtl).toBe(APP_BOTS_TTL_MS)
    expect(s.appBotsCheckedAt).toBeGreaterThan(0)
  })

  it('skips re-probe within the success TTL', async () => {
    apiGet.mockResolvedValueOnce({})
    await useFeatureStore.getState().probeAppBots()

    vi.advanceTimersByTime(5 * 60 * 1000)
    await useFeatureStore.getState().probeAppBots()

    expect(apiGet).toHaveBeenCalledTimes(1)
  })

  it('caches 404 with the full 10-minute TTL (route not registered)', async () => {
    apiGet.mockRejectedValueOnce(new ApiError('not found', 404))

    await useFeatureStore.getState().probeAppBots()

    const s = useFeatureStore.getState()
    expect(s.appBotsAvailable).toBe(false)
    expect(s.appBotsCheckTtl).toBe(APP_BOTS_TTL_MS)
  })

  it('caches 5xx with the short 30-second transient TTL', async () => {
    apiGet.mockRejectedValueOnce(new ApiError('server error', 500))

    await useFeatureStore.getState().probeAppBots()

    const s = useFeatureStore.getState()
    expect(s.appBotsAvailable).toBe(false)
    expect(s.appBotsCheckTtl).toBe(APP_BOTS_TRANSIENT_TTL_MS)
  })

  it('caches network error (no status) with the short transient TTL', async () => {
    apiGet.mockRejectedValueOnce(new ApiError('Network Error'))

    await useFeatureStore.getState().probeAppBots()

    expect(useFeatureStore.getState().appBotsCheckTtl).toBe(APP_BOTS_TRANSIENT_TTL_MS)
  })

  it('re-probes after the transient TTL expires (recovers within seconds, not 10 minutes)', async () => {
    apiGet.mockRejectedValueOnce(new ApiError('boom', 502))
    await useFeatureStore.getState().probeAppBots()
    expect(useFeatureStore.getState().appBotsAvailable).toBe(false)

    vi.advanceTimersByTime(APP_BOTS_TRANSIENT_TTL_MS + 1)
    apiGet.mockResolvedValueOnce({})
    await useFeatureStore.getState().probeAppBots()

    expect(apiGet).toHaveBeenCalledTimes(2)
    expect(useFeatureStore.getState().appBotsAvailable).toBe(true)
  })

  it('does NOT re-probe within the transient TTL (avoids hammering on sustained outage)', async () => {
    apiGet.mockRejectedValue(new ApiError('boom', 503))

    await useFeatureStore.getState().probeAppBots()
    vi.advanceTimersByTime(5 * 1000)
    await useFeatureStore.getState().probeAppBots()

    expect(apiGet).toHaveBeenCalledTimes(1)
  })

  it('force=true bypasses the cache', async () => {
    apiGet.mockResolvedValueOnce({})
    await useFeatureStore.getState().probeAppBots()

    apiGet.mockResolvedValueOnce({})
    await useFeatureStore.getState().probeAppBots(true)

    expect(apiGet).toHaveBeenCalledTimes(2)
  })

  it('resetFeatures clears cached probe result', async () => {
    apiGet.mockResolvedValueOnce({})
    await useFeatureStore.getState().probeAppBots()

    useFeatureStore.getState().resetFeatures()

    const s = useFeatureStore.getState()
    expect(s.appBotsAvailable).toBeNull()
    expect(s.appBotsCheckedAt).toBe(0)
    expect(s.appBotsCheckTtl).toBe(APP_BOTS_TTL_MS)
  })
})
