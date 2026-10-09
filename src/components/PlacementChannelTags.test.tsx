import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const batchSetPluginPlacements = vi.hoisted(() => vi.fn())
const confirm = vi.hoisted(() => vi.fn())

vi.mock('../api/marketplace-scene', () => ({ batchSetPluginPlacements }))
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) }
})
vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    message: { success: vi.fn(), error: vi.fn() },
    Modal: { confirm },
    Space: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    Tag: ({ children, closable, onClose }: { children?: React.ReactNode; closable?: boolean; onClose?: React.MouseEventHandler }) => React.createElement(
      'span',
      null,
      children,
      closable ? React.createElement('button', { 'data-testid': `remove-${String(children)}`, onClick: onClose }, 'remove') : null,
    ),
    Tooltip: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
  }
})

import PlacementChannelTags from './PlacementChannelTags'

describe('PlacementChannelTags', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    batchSetPluginPlacements.mockReset()
    confirm.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('removes one plugin from the selected non-default scene', async () => {
    const onSuccess = vi.fn()
    const rowClick = vi.fn()
    batchSetPluginPlacements.mockResolvedValue(undefined)
    confirm.mockImplementation(({ onOk }: { onOk: () => Promise<void> }) => void onOk())

    await act(async () => root.render(
      <div onClick={rowClick}>
        <PlacementChannelTags pluginId="p1" sceneCodes={['default', 'featured']} canWrite onSuccess={onSuccess} />
      </div>
    ))
    await act(async () => (host.querySelector('[data-testid="remove-featured"]') as HTMLButtonElement).click())

    expect(batchSetPluginPlacements).toHaveBeenCalledWith({
      scene_code: 'featured',
      plugin_ids: ['p1'],
      is_placed: false,
    })
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(host.querySelector('[data-testid="remove-default"]')).toBeNull()
    expect(rowClick).not.toHaveBeenCalled()
  })

  it('keeps each concurrent removal disabled until its own request finishes', async () => {
    let resolveFeatured!: () => void
    let resolveSeasonal!: () => void
    const featured = new Promise<void>((resolve) => { resolveFeatured = resolve })
    const seasonal = new Promise<void>((resolve) => { resolveSeasonal = resolve })
    batchSetPluginPlacements.mockImplementation(({ scene_code }: { scene_code: string }) => (
      scene_code === 'featured' ? featured : seasonal
    ))
    confirm.mockImplementation(({ onOk }: { onOk: () => Promise<void> }) => void onOk())

    await act(async () => root.render(
      <PlacementChannelTags
        pluginId="p1"
        sceneCodes={['featured', 'seasonal']}
        canWrite
        onSuccess={vi.fn()}
      />
    ))
    await act(async () => (host.querySelector('[data-testid="remove-featured"]') as HTMLButtonElement).click())
    await act(async () => (host.querySelector('[data-testid="remove-seasonal"]') as HTMLButtonElement).click())

    expect(host.querySelector('[data-testid="remove-featured"]')).toBeNull()
    expect(host.querySelector('[data-testid="remove-seasonal"]')).toBeNull()

    await act(async () => resolveFeatured())
    expect(host.querySelector('[data-testid="remove-featured"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="remove-seasonal"]')).toBeNull()

    await act(async () => resolveSeasonal())
    expect(host.querySelector('[data-testid="remove-seasonal"]')).not.toBeNull()
  })
})
