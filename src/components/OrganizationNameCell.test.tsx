import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    Tooltip: ({ title, children }: { title?: string; children: React.ReactNode }) =>
      React.createElement('span', { 'data-tooltip': title }, children),
  }
})

import OrganizationNameCell from './OrganizationNameCell'

describe('OrganizationNameCell', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('keeps the full organization name available as hover content', async () => {
    const name = 'A very long organization name that is wider than the table column'

    await act(async () => root.render(<OrganizationNameCell name={name} />))

    expect(host.textContent).toBe(name)
    expect(host.querySelector('[data-tooltip]')?.getAttribute('data-tooltip')).toBe(name)
    const label = host.querySelector('span span') as HTMLSpanElement
    expect(label.style.overflow).toBe('hidden')
    expect(label.style.textOverflow).toBe('ellipsis')
    expect(label.style.whiteSpace).toBe('nowrap')
  })

  it('does not show a tooltip for the unavailable-name placeholder', async () => {
    await act(async () => root.render(<OrganizationNameCell name="--" />))

    expect(host.textContent).toBe('--')
    expect(host.querySelector('[data-tooltip]')).toBeNull()
  })
})
