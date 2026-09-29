import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'

const mocks = vi.hoisted(() => ({ getSpace: vi.fn() }))

vi.mock('../api/space', () => ({ getSpace: mocks.getSpace }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => (key === 'space.global' ? 'Global' : key),
  }),
}))

import { useSpaceNameMap } from './useSpaceNameMap'

function NameProbe({ spaceId }: { spaceId?: string }) {
  const { nameOf } = useSpaceNameMap()
  const value = nameOf(spaceId)
  return <span data-testid="organization-name" data-resolved={value.resolved}>{value.label}</span>
}

describe('useSpaceNameMap', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mocks.getSpace.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('resolves a Space id to its organization name without exposing the id while loading', async () => {
    let resolve!: (value: { name: string }) => void
    mocks.getSpace.mockReturnValue(new Promise((done) => { resolve = done }))

    await act(async () => root.render(<NameProbe spaceId="space-internal-uuid" />))

    expect(host.textContent).toBe('--')
    expect(host.querySelector('[data-testid="organization-name"]')?.getAttribute('data-resolved')).toBe('false')
    expect(host.textContent).not.toContain('space-internal-uuid')
    expect(mocks.getSpace).toHaveBeenCalledOnce()
    expect(mocks.getSpace).toHaveBeenCalledWith('space-internal-uuid')

    await act(async () => resolve({ name: 'A very long organization name' }))

    expect(host.textContent).toBe('A very long organization name')
    expect(host.querySelector('[data-testid="organization-name"]')?.getAttribute('data-resolved')).toBe('true')
  })

  it('retries a transient organization lookup failure', async () => {
    mocks.getSpace
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValueOnce({ name: 'Recovered organization' })

    await act(async () => root.render(<NameProbe spaceId="failed-space-id" />))
    await act(async () => {})

    expect(mocks.getSpace).toHaveBeenCalledTimes(2)
    expect(host.textContent).toBe('Recovered organization')
    expect(host.textContent).not.toContain('failed-space-id')
  })

  it('uses the placeholder for a permanent miss or a response without a name', async () => {
    mocks.getSpace.mockRejectedValueOnce(new ApiError('not found', 404))

    await act(async () => root.render(<NameProbe spaceId="missing-space-id" />))
    await act(async () => {})

    expect(host.textContent).toBe('--')
    expect(mocks.getSpace).toHaveBeenCalledOnce()
    expect(host.textContent).not.toContain('missing-space-id')

    mocks.getSpace.mockResolvedValueOnce({ name: '   ' })
    await act(async () => root.render(<NameProbe spaceId="nameless-space-id" />))
    await act(async () => {})

    expect(host.textContent).toBe('--')
    expect(host.textContent).not.toContain('nameless-space-id')
  })

  it('keeps system-wide plugins labeled as global without making a lookup', async () => {
    await act(async () => root.render(<NameProbe />))

    expect(host.textContent).toBe('Global')
    expect(host.querySelector('[data-testid="organization-name"]')?.getAttribute('data-resolved')).toBe('true')
    expect(mocks.getSpace).not.toHaveBeenCalled()
  })
})
