import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReleaseEntry } from './utils'

// The page imports antd for its shell; the spotlight card itself uses none of it.
vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const Passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
  return {
    Tabs: Passthrough,
    Spin: Passthrough,
    Empty: Passthrough,
    Tag: Passthrough,
    Tooltip: Passthrough,
    ConfigProvider: Passthrough,
    theme: { darkAlgorithm: {}, defaultAlgorithm: {} },
  }
})

const { LatestReleaseSpotlight } = await import('./index')

const entry: ReleaseEntry = {
  os: 'windows',
  app_version: '1.0.0',
  is_force: 0,
  update_desc: '',
  download_url: '',
  created_at: '2026-08-20 16:34:04',
  builds: [
    { os: 'windows', download_url: 'https://cdn.example.com/setup.exe', created_at: '2026-08-20 16:34:04', is_force: 0, update_desc: '修复：启动白屏' },
    { os: 'macos', download_url: 'https://cdn.example.com/octo.dmg', created_at: '2026-08-20 14:18:06', is_force: 0, update_desc: '修复：启动白屏' },
  ],
}

describe('LatestReleaseSpotlight', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const render = (hideDownloads: boolean) => {
    act(() => root.render(<LatestReleaseSpotlight item={entry} severity="initial" hideDownloads={hideDownloads} />))
    return Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'))
  }

  it('links every installer when nothing above the card offers them', () => {
    expect(render(false)).toEqual([
      'https://cdn.example.com/setup.exe',
      'https://cdn.example.com/octo.dmg',
    ])
  })

  it('drops its own links when the band above already offers the same files', () => {
    // Two rows of identical buttons half a screen apart, otherwise.
    expect(render(true)).toEqual([])
  })

  it('still says what changed when it has stood its downloads down', () => {
    act(() => root.render(<LatestReleaseSpotlight item={entry} severity="initial" hideDownloads />))
    expect(host.textContent).toContain('启动白屏')
  })
})
