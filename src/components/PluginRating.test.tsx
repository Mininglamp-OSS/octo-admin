import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const updatePluginRating = vi.hoisted(() => vi.fn())
const success = vi.hoisted(() => vi.fn())

vi.mock('../api/plugin', () => ({ updatePluginRating }))
vi.mock('../api', () => ({ ApiError: class ApiError extends Error {} }))
vi.mock('@ant-design/icons', () => ({ EditOutlined: () => null }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    Space: ({ children, onClick }: { children?: React.ReactNode; onClick?: React.MouseEventHandler }) => React.createElement('div', { onClick }, children),
    Typography: { Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children) },
    Rate: ({ value, disabled, onChange }: { value: number; disabled?: boolean; onChange?: (value: number) => void }) => React.createElement('button', { disabled, 'data-testid': disabled ? 'display-rate' : 'edit-rate', 'data-value': value, onClick: () => onChange?.(4) }, String(value)),
    Button: ({ children, onClick, 'aria-label': ariaLabel }: { children?: React.ReactNode; onClick?: React.MouseEventHandler; 'aria-label'?: string }) => React.createElement('button', { onClick, 'aria-label': ariaLabel }, children),
    Modal: ({ open, children, onOk }: { open: boolean; children?: React.ReactNode; onOk?: () => void }) => open ? React.createElement('div', { role: 'dialog' }, children, React.createElement('button', { 'data-testid': 'ok', onClick: onOk }, 'ok')) : null,
    message: { success, error: vi.fn() },
  }
})

import PluginRating from './PluginRating'

describe('PluginRating', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    updatePluginRating.mockReset()
    success.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('renders an unrated read-only value without an edit action', async () => {
    await act(async () => root.render(<PluginRating pluginId="p1" rating={null} />))
    expect(host.textContent).toContain('pluginRating.unrated')
    expect(host.querySelector('[aria-label="pluginRating.edit"]')).toBeNull()
  })

  it('edits with the dedicated API and reports the new value', async () => {
    const changed = vi.fn()
    updatePluginRating.mockResolvedValue(undefined)
    await act(async () => root.render(
      <PluginRating pluginId="p1" rating={2} canEdit onChanged={changed} />
    ))
    await act(async () => (host.querySelector('[aria-label="pluginRating.edit"]') as HTMLButtonElement).click())
    await act(async () => (host.querySelector('[data-testid="edit-rate"]') as HTMLButtonElement).click())
    await act(async () => (host.querySelector('[data-testid="ok"]') as HTMLButtonElement).click())
    expect(updatePluginRating).toHaveBeenCalledWith('p1', 4)
    expect(changed).toHaveBeenCalledWith(4)
    expect(success).toHaveBeenCalledWith('pluginRating.saved')
  })
})
