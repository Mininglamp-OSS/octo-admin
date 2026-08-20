import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReleaseEntry } from './utils'

// The page imports antd for its shell; the card under test uses none of it.
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

const NAMES = ['ana', 'bo', 'cai', 'dee', 'eun', 'fei', 'gus', 'hana']

const entry: ReleaseEntry = {
  os: 'windows',
  app_version: '2.1.0',
  is_force: 0,
  update_desc: `修复：启动白屏\n@contributors: ${NAMES.join(', ')}`,
  download_url: '',
  created_at: '2026-08-20 16:34:04',
}

/* The avatar row is the one part of an entry that cannot shrink, and at the full
   count it — not the prose — decided how wide the page was on a phone. jsdom cannot
   measure that, but it can hold the rule that fixed it: fewer faces below 420px.

   The module reads the media query once and caches it, so each case needs a fresh
   module registry rather than a second render. */
async function renderAt(narrow: boolean) {
  vi.resetModules()
  window.matchMedia = ((query: string) => ({
    matches: narrow,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia

  const { LatestReleaseSpotlight } = await import('./index')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  await act(async () => {
    root.render(<LatestReleaseSpotlight item={entry} severity="minor" />)
  })
  const result = {
    avatars: host.querySelectorAll('img').length,
    badge: host.querySelector('.contributor-more-badge')?.textContent ?? null,
    text: host.textContent ?? '',
  }
  await act(async () => root.unmount())
  host.remove()
  return result
}

describe('contributor row', () => {
  let matchMedia: typeof window.matchMedia

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    matchMedia = window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = matchMedia
  })

  it('shows every contributor where there is room for them', async () => {
    const wide = await renderAt(false)
    expect(wide.avatars).toBe(NAMES.length)
    expect(wide.badge).toBeNull()
    expect(wide.text).toContain('贡献者')
  })

  it('shows five and counts the rest on a narrow screen', async () => {
    const narrow = await renderAt(true)
    expect(narrow.avatars).toBe(5)
    expect(narrow.badge).toBe(`+${NAMES.length - 5}`)
    // The label goes too: it is worth more room than it takes on a phone.
    expect(narrow.text).not.toContain('贡献者')
  })
})
