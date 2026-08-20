import { describe, expect, it } from 'vitest'
import { detectViewerOS, getVersionSeverity, groupReleases, parseContributors, parseUpdateDesc } from './utils'
import type { AppVersion } from './utils'

describe('parseContributors', () => {
  it('uses GitHub profile avatars for changelog contributors', () => {
    expect(parseContributors('@contributors: caster-Q, @octocat')).toEqual([
      {
        name: 'caster-Q',
        avatar: 'https://github.com/caster-Q.png?size=48',
        fallbackAvatar: 'https://api.dicebear.com/9.x/identicon/svg?seed=caster-Q&backgroundColor=b6e3f4',
      },
      {
        name: '@octocat',
        avatar: 'https://github.com/octocat.png?size=48',
        fallbackAvatar: 'https://api.dicebear.com/9.x/identicon/svg?seed=%40octocat&backgroundColor=ffdfbf',
      },
    ])
  })
})

describe('parseUpdateDesc', () => {
  it('files a platform-first release announcement under added', () => {
    const parsed = parseUpdateDesc('Windows 桌面端 1.0.0 版本发布')
    expect(parsed.added).toEqual([{ text: 'Windows 桌面端 1.0.0 版本发布', group: undefined }])
    expect(parsed.other).toEqual([])
  })

  it('keeps an explicit prefix ahead of the release-announcement fallback', () => {
    expect(parseUpdateDesc('修复 macOS 上的崩溃发布').fixed).toHaveLength(1)
  })
})

describe('getVersionSeverity', () => {
  it('marks a 1.0.0 with no predecessor as the initial release', () => {
    expect(getVersionSeverity('1.0.0')).toBe('initial')
  })

  it('tags nothing when there is no predecessor to diff against', () => {
    expect(getVersionSeverity('3.2.1')).toBe('unknown')
    expect(getVersionSeverity('3.2.1', 'not-a-version')).toBe('unknown')
  })
})

const release = (over: Partial<AppVersion>): AppVersion => ({
  app_version: '',
  os: 'web',
  is_force: 0,
  update_desc: '',
  download_url: '',
  created_at: '2026-08-20 12:00:00',
  ...over,
})

describe('groupReleases', () => {
  it('collects every OS build of one desktop version into a single card', () => {
    const [entry, ...rest] = groupReleases([
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/setup.exe', update_desc: 'Windows 桌面端 1.0.0 版本发布', created_at: '2026-08-20 16:34:04' }),
      release({ os: 'macos', app_version: '1.0.0', download_url: 'https://x/octo.dmg', update_desc: 'Mac 桌面端 1.0.0 版本发布', created_at: '2026-08-20 14:18:06' }),
    ])

    expect(rest).toEqual([])
    expect(entry.app_version).toBe('1.0.0')
    expect(entry.builds).toEqual([
      { os: 'windows', download_url: 'https://x/setup.exe' },
      { os: 'macos', download_url: 'https://x/octo.dmg' },
    ])
    // The card is dated by the newest build, and keeps both sets of notes.
    expect(entry.created_at).toBe('2026-08-20 16:34:04')
    expect(entry.update_desc).toContain('Windows 桌面端 1.0.0 版本发布')
    expect(entry.update_desc).toContain('Mac 桌面端 1.0.0 版本发布')
  })

  it('keeps identical per-OS notes from being repeated on the card', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '2.1.0', update_desc: '新增：全局搜索' }),
      release({ os: 'macos', app_version: '2.1.0', update_desc: '新增：全局搜索' }),
    ])

    expect(entry.update_desc).toBe('新增：全局搜索')
  })

  it('keeps the newest build when one OS ships the same version twice', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/setup-2.exe', created_at: '2026-08-20 18:00:00' }),
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/setup-1.exe', created_at: '2026-08-20 16:00:00' }),
    ])

    expect(entry.builds).toEqual([{ os: 'windows', download_url: 'https://x/setup-2.exe' }])
  })

  it('separates desktop versions and never mixes them with web or mobile', () => {
    const entries = groupReleases([
      release({ os: 'macos', app_version: '1.1.0' }),
      release({ os: 'windows', app_version: '1.0.0' }),
      release({ os: 'ios', app_version: '3.4.1' }),
    ])

    expect(entries.map((e) => [e.os, e.app_version])).toEqual([
      ['macos', '1.1.0'],
      ['windows', '1.0.0'],
      ['ios', '3.4.1'],
    ])
  })

  it('still groups a day of web deploys when a release lands between them', () => {
    const entries = groupReleases([
      release({ os: 'web', update_desc: '优化：搜索', created_at: '2026-08-20 18:00:00' }),
      release({ os: 'windows', app_version: '1.0.0', created_at: '2026-08-20 16:34:04' }),
      release({ os: 'web', update_desc: '修复：白屏', created_at: '2026-08-20 09:00:00' }),
    ])

    expect(entries).toHaveLength(2)
    expect(entries[0].os).toBe('web')
    expect(entries[0].update_desc).toContain('优化：搜索')
    expect(entries[0].update_desc).toContain('修复：白屏')
    expect(entries[1].os).toBe('windows')
  })
})

describe('detectViewerOS', () => {
  it('recognises the desktop platforms it can offer a build for', () => {
    expect(detectViewerOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('windows')
    expect(detectViewerOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe('macos')
    expect(detectViewerOS('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')).toBe('linux')
  })

  it('stays silent where a desktop installer is useless', () => {
    expect(detectViewerOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBeNull()
    expect(detectViewerOS('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBeNull()
    expect(detectViewerOS('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toBeNull()
    // iPadOS claims to be a Mac; the touch points are the tell.
    expect(detectViewerOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBeNull()
  })
})
