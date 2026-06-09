import { describe, expect, it } from 'vitest'
import { buildDashboardSearchParams } from './dashboard'

describe('buildDashboardSearchParams', () => {
  it('serializes space_ids as repeated query keys', () => {
    const params = buildDashboardSearchParams({
      start_date: '2026-05-06',
      end_date: '2026-06-05',
      space_ids: ['space-a', 'space-b'],
    })

    expect(params.toString()).toBe(
      'start_date=2026-05-06&end_date=2026-06-05&space_ids=space-a&space_ids=space-b',
    )
  })

  it('drops empty optional values', () => {
    const params = buildDashboardSearchParams({
      name: '',
      active_status: 'all',
      page_index: 1,
      page_size: 20,
    })

    expect(params.toString()).toBe('active_status=all&page_index=1&page_size=20')
  })

  it('serializes trend granularity with repeated space_ids', () => {
    const params = buildDashboardSearchParams({
      start_date: '2026-05-06',
      end_date: '2026-06-05',
      space_ids: ['space-a'],
      granularity: 'week',
    })

    expect(params.toString()).toBe(
      'start_date=2026-05-06&end_date=2026-06-05&space_ids=space-a&granularity=week',
    )
  })
})
