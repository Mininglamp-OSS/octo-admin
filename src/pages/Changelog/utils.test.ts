import { describe, expect, it } from 'vitest'
import { detectViewerOS, getVersionSeverity, groupReleases, orderBuilds, parseContributors, parseUpdateDesc } from './utils'
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

  it('never lets a release-announcement heading swallow the sections under it', () => {
    for (const heading of ['## Windows 桌面端 1.0.0 版本发布', '**Windows 桌面端 1.0.0 版本发布**']) {
      const parsed = parseUpdateDesc(`${heading}\n- 修复：启动白屏\n- 移除：旧的托盘菜单\n- 安全：升级依赖`)
      expect(parsed.fixed.map((c) => c.text)).toEqual(['启动白屏'])
      expect(parsed.removed.map((c) => c.text)).toEqual(['旧的托盘菜单'])
      expect(parsed.security.map((c) => c.text)).toEqual(['升级依赖'])
      expect(parsed.added).toEqual([])
    }
  })

  it('leaves a 【…】 heading behaving exactly as it did before', () => {
    // An unrecognised 【…】 heading has always pinned the lines under it to 其他
    // (SECTION_HEADING keeps 'other', unlike the markdown path). Not this change's
    // to fix — but the release-announcement rule must not turn them into 新增.
    const parsed = parseUpdateDesc('【1.0.0 正式发布】\n- 修复：启动白屏\n- 安全：升级依赖')
    expect(parsed.other.map((c) => c.text)).toEqual(['启动白屏', '升级依赖'])
    expect(parsed.added).toEqual([])
  })

  it('does not read ordinary prose that merely ends in 上线 as a new feature', () => {
    expect(parseUpdateDesc('问题：功能无法上线').other).toHaveLength(1)
    expect(parseUpdateDesc('问题：功能无法上线').added).toEqual([])
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

  it('tags nothing when the comparison does not move forward', () => {
    // Staggered rollout: macOS 1.0.0 lands after Windows 1.1.0 in the shared lane.
    expect(getVersionSeverity('1.0.0', '1.1.0')).toBe('unknown')
    expect(getVersionSeverity('2.3.4', '2.3.4')).toBe('unknown')
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
      { os: 'windows', download_url: 'https://x/setup.exe', created_at: '2026-08-20 16:34:04' },
      { os: 'macos', download_url: 'https://x/octo.dmg', created_at: '2026-08-20 14:18:06' },
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

  it('links the newest build when one OS ships the same version twice, in either feed order', () => {
    const newest = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/setup-2.exe', created_at: '2026-08-20 18:00:00', is_force: 1 })
    const oldest = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/setup-1.exe', created_at: '2026-08-20 16:00:00' })

    for (const feed of [[newest, oldest], [oldest, newest]]) {
      const [entry] = groupReleases(feed)
      expect(entry.builds).toEqual([
        { os: 'windows', download_url: 'https://x/setup-2.exe', created_at: '2026-08-20 18:00:00' },
      ])
      expect(entry.created_at).toBe('2026-08-20 18:00:00')
      expect(entry.is_force).toBe(1)
    }
  })

  it('unions per-OS notes line by line instead of dropping a shorter set', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '2.1.0', update_desc: '修复：启动崩溃\n新增：全局搜索' }),
      release({ os: 'macos', app_version: '2.1.0', update_desc: '修复：启动崩溃\n新增：菜单栏图标' }),
    ])

    expect(entry.update_desc.split('\n')).toEqual(['修复：启动崩溃', '新增：全局搜索', '新增：菜单栏图标'])
  })

  it('hands back copies, never the objects the caller passed in', () => {
    const input = [release({ os: 'ios', app_version: '3.4.1' })]
    expect(groupReleases(input)[0]).not.toBe(input[0])
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

describe('orderBuilds', () => {
  const builds = [
    { os: 'windows', download_url: 'a.exe', created_at: '2026-08-20 16:00:00' },
    { os: 'macos', download_url: 'a.dmg', created_at: '2026-08-20 14:00:00' },
    { os: 'linux', download_url: 'a.AppImage', created_at: '2026-08-20 12:00:00' },
  ]

  it("leads with the visitor's own platform", () => {
    expect(orderBuilds(builds, 'macos').map((b) => b.os)).toEqual(['macos', 'windows', 'linux'])
    expect(orderBuilds(builds, 'linux').map((b) => b.os)).toEqual(['linux', 'windows', 'macos'])
  })

  it('falls back to the canonical order when the visitor is unknown', () => {
    expect(orderBuilds(builds, null).map((b) => b.os)).toEqual(['windows', 'macos', 'linux'])
  })

  it('does not mutate the builds it was given', () => {
    const original = [...builds]
    orderBuilds(builds, 'linux')
    expect(builds).toEqual(original)
  })
})
