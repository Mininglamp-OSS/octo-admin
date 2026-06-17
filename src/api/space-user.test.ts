import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the shared axios instance so we can assert the exact request shape.
const get = vi.fn()
vi.mock('./index', () => ({
  default: { get: (...args: unknown[]) => get(...args) },
}))

import { searchSpaceUserMembers } from './space-user'

describe('searchSpaceUserMembers', () => {
  beforeEach(() => {
    get.mockReset()
  })

  // Regression for issue #93: the space-management member list could not
  // paginate or search because the old GET /members endpoint returned a bare
  // array with no total. octo-server#389 added GET /members/search returning a
  // { count, list } envelope with server-side keyword + page_index/page_size.
  it('hits the search endpoint with keyword + pagination and unwraps the envelope', async () => {
    const envelope = {
      count: 137,
      list: [
        {
          uid: 'u1',
          name: 'Alice',
          username: 'alice',
          email: 'alice@example.com',
          phone: '138****5678',
          role: 1 as const,
          robot: 0 as const,
          created_at: '2026-01-01',
        },
      ],
    }
    get.mockResolvedValue({ data: envelope })

    const res = await searchSpaceUserMembers('space-1', {
      keyword: 'ali',
      page_index: 2,
      page_size: 20,
    })

    // New endpoint path + new param names (not the old /members with page/limit).
    expect(get).toHaveBeenCalledWith('/v1/space/space-1/members/search', {
      params: { keyword: 'ali', page_index: 2, page_size: 20 },
    })
    // The total comes from the server envelope, not the current page length —
    // this is what makes pagination appear for spaces with > PAGE_SIZE members.
    expect(res.count).toBe(137)
    expect(res.list).toHaveLength(1)
    expect(res.list[0].uid).toBe('u1')
  })

  it('omits keyword when not provided so the request stays unfiltered', async () => {
    get.mockResolvedValue({ data: { count: 0, list: [] } })

    await searchSpaceUserMembers('space-1', { page_index: 1, page_size: 20 })

    expect(get).toHaveBeenCalledWith('/v1/space/space-1/members/search', {
      params: { page_index: 1, page_size: 20 },
    })
  })
})
