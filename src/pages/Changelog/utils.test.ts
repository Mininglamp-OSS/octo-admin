import { describe, expect, it } from 'vitest'
import { detectViewerOS, getVersionSeverity, groupReleases, noteBlocks, orderBuilds, parseContributors, parseUpdateDesc, safeDownloadUrl } from './utils'
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

  it('does not call the oldest build of a long-lived 1.0.0 an initial release', () => {
    // Where the semver sits still and only the build number advances, the oldest
    // row in any window would otherwise be stamped "Initial Release".
    expect(getVersionSeverity('1.0.0(62)')).toBe('unknown')
    expect(getVersionSeverity('1.0.0(1)')).toBe('initial')
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
      { os: 'windows', download_url: 'https://x/setup.exe', created_at: '2026-08-20 16:34:04', is_force: 0, update_desc: 'Windows 桌面端 1.0.0 版本发布' },
      { os: 'macos', download_url: 'https://x/octo.dmg', created_at: '2026-08-20 14:18:06', is_force: 0, update_desc: 'Mac 桌面端 1.0.0 版本发布' },
    ])
    // The card is dated by the newest build, and every build's notes are reachable.
    expect(entry.created_at).toBe('2026-08-20 16:34:04')
    expect(noteBlocks(entry).map((block) => block.desc)).toEqual([
      'Windows 桌面端 1.0.0 版本发布',
      'Mac 桌面端 1.0.0 版本发布',
    ])
  })

  it('keeps identical per-OS notes from being repeated on the card', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '2.1.0', update_desc: '新增：全局搜索' }),
      release({ os: 'macos', app_version: '2.1.0', update_desc: '新增：全局搜索' }),
    ])

    // One block, unlabelled: both builds said the same thing.
    expect(noteBlocks(entry)).toEqual([{ os: [], desc: '新增：全局搜索' }])
  })

  it('links the newest build when one OS ships the same version twice, in either feed order', () => {
    const newest = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/setup-2.exe', created_at: '2026-08-20 18:00:00', is_force: 1 })
    const oldest = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/setup-1.exe', created_at: '2026-08-20 16:00:00' })

    for (const feed of [[newest, oldest], [oldest, newest]]) {
      const [entry] = groupReleases(feed)
      expect(entry.builds).toEqual([
        { os: 'windows', download_url: 'https://x/setup-2.exe', created_at: '2026-08-20 18:00:00', is_force: 1, update_desc: '' },
      ])
      expect(entry.created_at).toBe('2026-08-20 18:00:00')
      expect(entry.is_force).toBe(1)
    }
  })

  it('does not let a superseded upload force the build the card links', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '3.0.0', download_url: 'https://x/new.exe', created_at: '2026-08-20 18:00:00', is_force: 0 }),
      release({ os: 'windows', app_version: '3.0.0', download_url: 'https://x/old.exe', created_at: '2026-08-20 10:00:00', is_force: 1 }),
    ])

    expect(entry.builds?.[0].download_url).toBe('https://x/new.exe')
    expect(entry.is_force).toBe(0)
  })

  it('orders cards by their own date, not by the position they arrive in', () => {
    // The API sorts by updated_at, so re-saving an old row puts it at the head.
    const entries = groupReleases([
      release({ os: 'web', update_desc: '优化：旧的一天被重新保存', created_at: '2026-05-03 09:00:00' }),
      release({ os: 'android', app_version: '3.5.0', created_at: '2026-08-22 12:00:00' }),
      release({ os: 'web', update_desc: '修复：同一天的另一次部署', created_at: '2026-05-03 18:00:00' }),
    ])

    expect(entries.map((e) => [e.os, e.created_at])).toEqual([
      ['android', '2026-08-22 12:00:00'],
      ['web', '2026-05-03 18:00:00'],
    ])
  })

  it('sorts the deploys inside a web day card newest first', () => {
    // The feed arrives in updated_at order, which says nothing about deploy time.
    const [entry] = groupReleases([
      release({ os: 'web', update_desc: '优化：早上那次', created_at: '2026-08-19 09:00:00' }),
      release({ os: 'web', update_desc: '修复：晚上那次', created_at: '2026-08-19 20:00:00' }),
    ])

    expect(entry.created_at).toBe('2026-08-19 20:00:00')
    expect(entry.update_desc).toBe('@@TIME:20:00@@\n修复：晚上那次\n@@TIME:09:00@@\n优化：早上那次')
  })

  it('never loses a line that only one OS filed', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '2.1.0', update_desc: '修复：启动崩溃\n新增：全局搜索' }),
      release({ os: 'macos', app_version: '2.1.0', update_desc: '修复：启动崩溃\n新增：菜单栏图标' }),
    ])

    expect(noteBlocks(entry)).toEqual([
      { os: ['windows'], desc: '修复：启动崩溃\n新增：全局搜索' },
      { os: ['macos'], desc: '修复：启动崩溃\n新增：菜单栏图标' },
    ])
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
    { os: 'windows', download_url: 'a.exe', created_at: '2026-08-20 16:00:00', is_force: 0, update_desc: '' },
    { os: 'macos', download_url: 'a.dmg', created_at: '2026-08-20 14:00:00', is_force: 0, update_desc: '' },
    { os: 'linux', download_url: 'a.AppImage', created_at: '2026-08-20 12:00:00', is_force: 0, update_desc: '' },
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

describe('safeDownloadUrl', () => {
  it('passes through the links a release actually uses', () => {
    expect(safeDownloadUrl('https://cdn.example.com/OCTO-Setup-1.0.0.exe')).toBe('https://cdn.example.com/OCTO-Setup-1.0.0.exe')
    expect(safeDownloadUrl('http://cdn.example.com/a.dmg')).toBe('http://cdn.example.com/a.dmg')
    expect(safeDownloadUrl('/static/desktop/a.exe')).toBe('/static/desktop/a.exe')
  })

  it('refuses to hand a scripting URL to the browser', () => {
    expect(safeDownloadUrl('javascript:alert(1)')).toBeNull()
    expect(safeDownloadUrl('JaVaScRiPt:alert(1)')).toBeNull()
    // Browsers strip control characters before resolving the scheme; so do we.
    expect(safeDownloadUrl('java\tscript:alert(1)')).toBeNull()
    expect(safeDownloadUrl(' data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeDownloadUrl('')).toBeNull()
    expect(safeDownloadUrl(null)).toBeNull()
    expect(safeDownloadUrl(undefined)).toBeNull()
  })

  it('refuses a network-path reference in every shape the browser folds to one', () => {
    // Against an http(s) base a backslash is folded to a slash, so all four of these
    // are an authority rather than the relative path they look like.
    expect(safeDownloadUrl('//attacker.example/x.exe')).toBeNull()
    expect(safeDownloadUrl('///attacker.example/x.exe')).toBeNull()
    expect(safeDownloadUrl('\\\\attacker.example\\x.exe')).toBeNull()
    expect(safeDownloadUrl('/\\attacker.example/x.exe')).toBeNull()
    expect(safeDownloadUrl('\\/attacker.example/x.exe')).toBeNull()
  })

  it('refuses an http(s) scheme with no authority, which is still absolute', () => {
    // "http:attacker.example" on an https page navigates off-origin, not to a path.
    expect(safeDownloadUrl('http:attacker.example')).toBeNull()
    expect(safeDownloadUrl('https:attacker.example')).toBeNull()
    expect(safeDownloadUrl('HTTPS://cdn.example.com/a.exe')).toBe('HTTPS://cdn.example.com/a.exe')
  })
})


describe('noteBlocks', () => {
  it("keeps each platform's lines under the section that platform filed them in", () => {
    // parseUpdateDesc is stateful: a 【…】 heading owns every line below it. Merging
    // the two notes into one document filed the macOS-only security fix under
    // Windows's trailing 新增 heading.
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '1.0.0', created_at: '2026-08-20 16:00:00', update_desc: '【安全】\n升级 Electron 依赖\n【新增】\n托盘菜单' }),
      release({ os: 'macos', app_version: '1.0.0', created_at: '2026-08-20 14:00:00', update_desc: '【安全】\n升级 Electron 依赖\n修复 Gatekeeper 绕过\n【新增】\n托盘菜单' }),
    ])

    const blocks = noteBlocks(entry)
    expect(blocks.map((block) => block.os)).toEqual([['windows'], ['macos']])

    const macOS = parseUpdateDesc(blocks[1].desc)
    expect(macOS.security.map((c) => c.text)).toEqual(['Electron 依赖', 'Gatekeeper 绕过'])
    expect(macOS.added.map((c) => c.text)).toEqual(['托盘菜单'])
    for (const block of blocks) {
      expect(parseUpdateDesc(block.desc).added.map((c) => c.text)).not.toContain('Gatekeeper 绕过')
    }
  })

  it("leads with the visitor's own platform", () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '1.0.0', update_desc: 'Windows 版' }),
      release({ os: 'macos', app_version: '1.0.0', update_desc: 'Mac 版' }),
    ])

    expect(noteBlocks(entry, 'macos').map((block) => block.os)).toEqual([['macos'], ['windows']])
  })

  it('labels a block with every platform sharing it', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '1.0.0', update_desc: '共同的说明' }),
      release({ os: 'linux', app_version: '1.0.0', update_desc: '共同的说明' }),
      release({ os: 'macos', app_version: '1.0.0', update_desc: 'Mac 专属说明' }),
    ])

    expect(noteBlocks(entry, null)).toEqual([
      { os: ['windows', 'linux'], desc: '共同的说明' },
      { os: ['macos'], desc: 'Mac 专属说明' },
    ])
  })

  it('does not present one platform\'s notes as release-wide when a sibling filed none', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '1.0.0', update_desc: '', created_at: '2026-08-20 16:00:00' }),
      release({ os: 'macos', app_version: '1.0.0', update_desc: '【安全】\n修复 Gatekeeper 绕过', created_at: '2026-08-20 14:00:00' }),
    ])

    // One block, but only because Windows said nothing — it stays labelled.
    expect(noteBlocks(entry)).toEqual([{ os: ['macos'], desc: '【安全】\n修复 Gatekeeper 绕过' }])
  })

  it('passes a non-desktop card through as a single block', () => {
    const [entry] = groupReleases([release({ os: 'ios', app_version: '3.4.1', update_desc: '修复：推送角标' })])
    expect(noteBlocks(entry)).toEqual([{ os: [], desc: '修复：推送角标' }])
  })
})
