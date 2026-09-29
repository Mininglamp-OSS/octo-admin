import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSpace: vi.fn() }))

vi.mock('../api/space', () => ({ getSpace: mocks.getSpace }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'space.global' ? 'Global' : key),
  }),
}))

import { useSpaceNameMap } from './useSpaceNameMap'

function NameProbe({ spaceId }: { spaceId?: string }) {
  const { nameOf } = useSpaceNameMap()
  return <span data-testid="organization-name">{nameOf(spaceId)}</span>
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
    expect(host.textContent).not.toContain('space-internal-uuid')
    expect(mocks.getSpace).toHaveBeenCalledOnce()
    expect(mocks.getSpace).toHaveBeenCalledWith('space-internal-uuid')

    await act(async () => resolve({ name: 'A very long organization name' }))

    expect(host.textContent).toBe('A very long organization name')
  })

  it('uses the placeholder when the organization lookup fails or returns no name', async () => {
    mocks.getSpace.mockRejectedValueOnce(new Error('unavailable'))

    await act(async () => root.render(<NameProbe spaceId="failed-space-id" />))
    await act(async () => {})

    expect(host.textContent).toBe('--')
    expect(host.textContent).not.toContain('failed-space-id')

    mocks.getSpace.mockResolvedValueOnce({ name: '   ' })
    await act(async () => root.render(<NameProbe spaceId="nameless-space-id" />))
    await act(async () => {})

    expect(host.textContent).toBe('--')
    expect(host.textContent).not.toContain('nameless-space-id')
  })

  it('keeps system-wide plugins labeled as global without making a lookup', async () => {
    await act(async () => root.render(<NameProbe />))

    expect(host.textContent).toBe('Global')
    expect(mocks.getSpace).not.toHaveBeenCalled()
  })
})
