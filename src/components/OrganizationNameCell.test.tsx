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

    await act(async () => root.render(
      <OrganizationNameCell value={{ label: name, resolved: true }} maxWidth={160} />,
    ))

    expect(host.textContent).toBe(name)
    expect(host.querySelector('[data-tooltip]')?.getAttribute('data-tooltip')).toBe(name)
    const label = host.querySelector('span span') as HTMLSpanElement
    expect(label.style.overflow).toBe('hidden')
    expect(label.style.textOverflow).toBe('ellipsis')
    expect(label.style.whiteSpace).toBe('nowrap')
    expect(label.style.maxWidth).toBe('160px')
  })

  it('does not show a tooltip for the unavailable-name placeholder', async () => {
    await act(async () => root.render(
      <OrganizationNameCell value={{ label: '--', resolved: false }} maxWidth={160} />,
    ))

    expect(host.textContent).toBe('--')
    expect(host.querySelector('[data-tooltip]')).toBeNull()
  })

  it('preserves a legitimate organization name that matches the placeholder text', async () => {
    await act(async () => root.render(
      <OrganizationNameCell value={{ label: '--', resolved: true }} maxWidth={160} />,
    ))

    expect(host.textContent).toBe('--')
    expect(host.querySelector('[data-tooltip]')?.getAttribute('data-tooltip')).toBe('--')
  })
})
