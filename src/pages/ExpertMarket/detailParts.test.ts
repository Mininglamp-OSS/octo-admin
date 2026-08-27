/**
 * Unit coverage for `loadSkillMd` — the resolver behind the Expert/Squad
 * SKILL.md viewer. It prefers the authoritative admin preview
 * (`getAdminSkillMd` by skill plugin id) and falls back to the inline stub
 * carried on the detail read when the id is absent or the endpoint 404s
 * (getAdminSkillMd already maps a 404 to `null`). A non-404 failure must
 * propagate so the modal can surface the outage rather than mask it behind
 * the stub.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAdminSkillMd = vi.hoisted(() => vi.fn())
vi.mock('../../api/skill', () => ({ getAdminSkillMd: mockGetAdminSkillMd }))

import { loadSkillMd } from './detailParts'

beforeEach(() => {
  mockGetAdminSkillMd.mockReset()
})

describe('loadSkillMd', () => {
  it('returns "" for a null source without touching the network', async () => {
    await expect(loadSkillMd(null)).resolves.toBe('')
    expect(mockGetAdminSkillMd).not.toHaveBeenCalled()
  })

  it('prefers the authoritative admin SKILL.md over the inline stub', async () => {
    mockGetAdminSkillMd.mockResolvedValue('# Real skill\n\nbody')
    await expect(
      loadSkillMd({ skillPluginId: 'sk-1', fallback: '# stub' })
    ).resolves.toBe('# Real skill\n\nbody')
    expect(mockGetAdminSkillMd).toHaveBeenCalledWith('sk-1')
  })

  it('falls back to the inline stub when the endpoint 404s (null)', async () => {
    mockGetAdminSkillMd.mockResolvedValue(null)
    await expect(
      loadSkillMd({ skillPluginId: 'sk-1', fallback: '# stub' })
    ).resolves.toBe('# stub')
  })

  it('uses the inline stub without a request when no plugin id is available', async () => {
    await expect(loadSkillMd({ fallback: '# inline' })).resolves.toBe('# inline')
    expect(mockGetAdminSkillMd).not.toHaveBeenCalled()
  })

  it('propagates a non-404 failure instead of masking it behind the stub', async () => {
    mockGetAdminSkillMd.mockRejectedValue(new Error('boom'))
    await expect(
      loadSkillMd({ skillPluginId: 'sk-1', fallback: '# stub' })
    ).rejects.toThrow('boom')
  })
})
