import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopDownload } from './utils'

// The page imports antd for its shell; the band itself uses none of it.
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

const { DesktopDownloadBar } = await import('./index')

const build = (os: string, app_version: string, download_url = `https://cdn.example.com/${os}`): DesktopDownload => ({
  os,
  app_version,
  download_url,
  created_at: '2026-08-20 16:00:00',
  is_force: 0,
  update_desc: '',
})

describe('DesktopDownloadBar', () => {
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

  const render = (downloads: DesktopDownload[], handheld = false) => {
    act(() => root.render(<DesktopDownloadBar downloads={downloads} handheld={handheld} />))
    return host.textContent ?? ''
  }

  it('labels a version every offered installer shares', () => {
    expect(render([build('windows', '1.0.0'), build('macos', '1.0.0')])).toContain('v1.0.0 · 支持')
  })

  it('says no version when one platform is on a prerelease and another is not', () => {
    // Both format to 1.0.0, so a formatted comparison would badge the RC as stable
    // above the button that hands it over.
    for (const offers of [
      [build('windows', '1.0.0'), build('macos', '1.0.0-rc1')],
      [build('windows', '1.0.0-rc1'), build('macos', '1.0.0')],
    ]) {
      const text = render(offers)
      expect(text).not.toContain('v1.0.0')
      expect(text).toContain('支持')
    }
  })

  it('keeps a lone prerelease verbatim', () => {
    // formatVersion drops the suffix, so this would otherwise read "v1.0.1" above a
    // button handing over the release candidate.
    expect(render([build('macos', '1.0.1-rc1')])).toContain('1.0.1-rc1 · 支持 macOS')
  })

  it('renders one link per installer, and nothing at all without one', () => {
    render([build('windows', '1.0.0'), build('macos', '1.0.0')])
    expect(Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'https://cdn.example.com/windows',
      'https://cdn.example.com/macos',
    ])

    expect(render([])).toBe('')
  })

  it('drops an installer whose URL should never reach an href', () => {
    render([build('windows', '1.0.0', 'javascript:alert(1)'), build('macos', '1.0.0')])
    expect(Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'https://cdn.example.com/macos',
    ])
  })

  it('offers no buttons on a phone, only word that the app exists', () => {
    const text = render([build('windows', '1.0.0'), build('macos', '1.0.0')], true)
    expect(host.querySelectorAll('a')).toHaveLength(0)
    expect(text).toContain('v1.0.0')
    expect(text).toContain('Windows、macOS')
    expect(text).toContain('在电脑上打开本页即可下载')
  })

  it('still says nothing on a phone when there is no build to mention', () => {
    expect(render([], true)).toBe('')
  })
})
