import { describe, expect, it } from 'vitest'
import { detectViewerOS, forcedPlatforms, formatVersion, isHandheld, getVersionSeverity, groupReleases, latestDesktopDownloads, noteBlocks, offerVersionLabel, offeredAbove, orderBuilds, parseContributors, parseUpdateDesc, safeDownloadUrl } from './utils'
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
  it('marks a line that only announces a release, and files it under 其他', () => {
    // Marked, not deleted: the card counters skip it, so shipping stops being
    // reported as a feature, but a reader still sees every line an author wrote.
    const parsed = parseUpdateDesc('Windows 桌面端 1.0.0 版本发布')
    expect(parsed.added).toEqual([])
    expect(parsed.other).toEqual([{ text: 'Windows 桌面端 1.0.0 版本发布', group: undefined, announces: { version: '1.0.0', subject: 'Windows 桌面端' } }])
  })

  it('marks the announcement wherever the note happens to file it', () => {
    // The counters read the mark, not the category, so all three shapes of the same
    // sentence stop inflating 新增 — under a heading, behind a prefix, or bare.
    for (const desc of ['新增\n- Windows 桌面端 1.0.0 版本发布', '新增：Windows 桌面端 1.0.0 版本发布']) {
      expect(parseUpdateDesc(desc).added).toEqual([
        { text: 'Windows 桌面端 1.0.0 版本发布', group: undefined, announces: { version: '1.0.0', subject: 'Windows 桌面端' } },
      ])
    }
  })

  it('never marks a line that reports a change on its way to the announcement', () => {
    // Chinese writes without spaces, so any slack in the rule swallows meaning:
    // these read as bare announcements while the fix they report disappears, and
    // only the spaced variant — the unusual one — survived.
    for (const desc of [
      '2.0.0修复若干问题后正式发布',
      'Windows 桌面端 1.0.0修复白屏后正式发布。',
      '1.0.0解决登录崩溃后正式上线',
    ]) {
      const items = Object.values(parseUpdateDesc(desc)).flat()
      expect(items).toHaveLength(1)
      expect(items[0].announces).toBeUndefined()
    }
  })

  it('never marks a line that says anything besides the announcement', () => {
    // Marking these would let a card drop them, and a reader cannot tell a note
    // that was never written from one a regex removed.
    for (const desc of [
      '白屏崩溃已解决，伴随 1.0.0 版本发布',
      '协议从 1.0 升级到 2.0 正式上线',
      '1.5x 倍速播放正式上线',
      '深色模式正式发布',
      'TLS 1.3 通道上线',
    ]) {
      const items = Object.values(parseUpdateDesc(desc)).flat()
      expect(items).toHaveLength(1)
      expect(items[0].announces).toBeUndefined()
      expect(items[0].text).toContain(desc.slice(0, 4))
    }
  })

  it('keeps an announcement that names a feature rather than a version', () => {
    expect(parseUpdateDesc('深色模式正式发布').added).toEqual([{ text: '深色模式正式发布', group: undefined }])
    // A number in a feature's name is not the sentence announcing a release: the
    // version has to sit next to the announcement, not merely somewhere in the line.
    expect(parseUpdateDesc('1.5x 倍速播放正式上线').added).toHaveLength(1)
  })

  it('leaves prose that ends in 上线 without an announcement qualifier alone', () => {
    // Dropping requires the same 正式/首次/版本 qualifier the rule above requires;
    // without it a line naming a version is still just a line.
    expect(parseUpdateDesc('TLS 1.3 通道上线').other).toHaveLength(1)
    expect(parseUpdateDesc('TLS 1.3 通道上线').added).toEqual([])
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
    // parseSemVer reads 1.0.0 out of this one, and it is the opposite of a first
    // stable release.
    expect(getVersionSeverity('1.0.0-rc1')).toBe('unknown')
  })

  it('reads the version prefix however it was typed', () => {
    expect(getVersionSeverity('v1.0.0')).toBe('initial')
    expect(getVersionSeverity('V1.0.0')).toBe('initial')
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

  it('links the same installer the band offers when two rows tie on the second', () => {
    // Two uploads of one OS at the same timestamp: the card and the band each pick
    // a winner, and if they break the tie differently the page shows a version and
    // hands over a different file.
    const rows = [
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/a.exe', created_at: '2026-08-20 16:34:04' }),
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/b.exe', created_at: '2026-08-20 16:34:04' }),
    ]

    for (const feed of [rows, [...rows].reverse()]) {
      const [entry] = groupReleases(feed)
      expect(entry.builds?.[0].download_url).toBe(latestDesktopDownloads(feed)[0].download_url)
    }
  })

  it('shows the newest notes filed, whatever order three uploads arrive in', () => {
    // The build the card links and the notes it shows need not come from the same
    // row: a re-upload that only fixes a link is saved with the notes box empty.
    // Folding "keep what is there when the new one is blank" hands the card
    // whichever non-blank row happened to be seen first, which the feed decides.
    const older = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/1.exe', created_at: '2026-08-20 10:00:00', update_desc: '修复：启动白屏' })
    const newer = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/2.exe', created_at: '2026-08-20 12:00:00', update_desc: '修复：托盘图标丢失' })
    const relink = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/3.exe', created_at: '2026-08-20 18:00:00', update_desc: '  ' })

    const orders = [
      [older, newer, relink], [older, relink, newer], [newer, older, relink],
      [newer, relink, older], [relink, older, newer], [relink, newer, older],
    ]
    for (const feed of orders) {
      const [entry] = groupReleases(feed)
      expect(entry.builds?.[0].download_url).toBe('https://x/3.exe')
      expect(noteBlocks(entry)).toEqual([{ os: [], desc: '修复：托盘图标丢失' }])
    }
  })

  it('keeps the notes when the same build is re-uploaded with an empty box', () => {
    const notes = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/typo.exe', created_at: '2026-08-20 10:00:00', update_desc: '修复：启动白屏' })
    const blank = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/fixed.exe', created_at: '2026-08-20 18:00:00', update_desc: '   ' })

    // Both arrival orders: the feed is sorted by updated_at, so the blank re-upload
    // is as likely to be seen first as second, and only in one of those orders is
    // it the row being written over.
    for (const feed of [[notes, blank], [blank, notes]]) {
      const [entry] = groupReleases(feed)
      // The link follows the re-upload; what shipped did not change, so the notes
      // do not either.
      expect(entry.builds?.[0].download_url).toBe('https://x/fixed.exe')
      expect(noteBlocks(entry)).toEqual([{ os: [], desc: '修复：启动白屏' }])
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

describe('isHandheld', () => {
  it('names the devices that cannot run an installer at all', () => {
    expect(isHandheld('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
    expect(isHandheld('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true)
    expect(isHandheld('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true)
    // iPadOS claims to be a Mac; the touch points are the tell.
    expect(isHandheld('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe(true)
  })

  it('leaves every desktop alone, recognised or not', () => {
    expect(isHandheld('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe(false)
    expect(isHandheld('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe(false)
    expect(isHandheld('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')).toBe(false)
    // A Chromebook runs neither installer, but it is a computer: whoever visits
    // from one is browsing on the class of device the offer is aimed at, and
    // detectViewerOS staying silent is the whole answer there.
    expect(isHandheld('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toBe(false)
    // The one UA that must not be read as a phone: a desktop nothing recognises,
    // which is exactly who needs the offer.
    expect(isHandheld('SomeBrowser/1.0')).toBe(false)
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

  it('refuses a URL it could only approve by reading a different string', () => {
    // A space is not ignored inside a URL the way a tab is — it is a forbidden host
    // code point. Deciding on a copy with it removed approved one link and
    // published another.
    expect(safeDownloadUrl('http:// evil.com')).toBeNull()
    expect(safeDownloadUrl('https://evil.com .good.com')).toBeNull()
  })

  it('refuses every scheme that is not http(s), however it resolves', () => {
    expect(safeDownloadUrl('mailto:release@example.com')).toBeNull()
    expect(safeDownloadUrl('file:///etc/passwd')).toBeNull()
    expect(safeDownloadUrl('blob:https://cdn.example.com/abc')).toBeNull()
  })

  it('allows a relative path wherever on this origin it lands', () => {
    expect(safeDownloadUrl('../releases/a.exe')).toBe('../releases/a.exe')
    expect(safeDownloadUrl('a.exe')).toBe('a.exe')
    // A backslash written as data, not as a separator, is a path like any other.
    expect(safeDownloadUrl('/static/%5C%5Cattacker.example/x.exe')).toBe('/static/%5C%5Cattacker.example/x.exe')
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

describe('latestDesktopDownloads', () => {
  it('offers the newest installer for each desktop platform', () => {
    const offers = latestDesktopDownloads([
      release({ os: 'windows', app_version: '1.1.0', download_url: 'https://x/1.1.0.exe', created_at: '2026-09-01 10:00:00' }),
      release({ os: 'macos', app_version: '1.0.0', download_url: 'https://x/1.0.0.dmg', created_at: '2026-08-20 14:00:00' }),
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/1.0.0.exe', created_at: '2026-08-20 16:00:00' }),
    ])

    expect(offers.map((build) => [build.os, build.app_version, build.download_url])).toEqual([
      ['windows', '1.1.0', 'https://x/1.1.0.exe'],
      ['macos', '1.0.0', 'https://x/1.0.0.dmg'],
    ])
  })

  it('offers whichever platforms have a build, and nothing when none do', () => {
    const macOnly = latestDesktopDownloads([
      release({ os: 'macos', app_version: '1.0.0', download_url: 'https://x/a.dmg' }),
      release({ os: 'ios', app_version: '3.4.1', download_url: 'https://apps.apple.com/x' }),
      release({ os: 'web', update_desc: '优化：搜索' }),
    ])
    expect(macOnly.map((build) => build.os)).toEqual(['macos'])

    expect(latestDesktopDownloads([release({ os: 'android', download_url: 'https://x/a.apk' })])).toEqual([])
  })

  it('offers the higher version, not the row uploaded most recently', () => {
    // A hotfix row for an older version, added after the newer build shipped.
    const offers = latestDesktopDownloads([
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/1.0.0.exe', created_at: '2026-09-05 10:00:00' }),
      release({ os: 'windows', app_version: '1.1.0', download_url: 'https://x/1.1.0.exe', created_at: '2026-09-01 10:00:00' }),
    ])

    expect(offers.map((build) => build.app_version)).toEqual(['1.1.0'])
  })

  it('does not let a prerelease displace a stable release, whatever it is numbered', () => {
    // A prerelease is normally numbered ahead of the stable it precedes — 2.0.1-beta
    // exists before 2.0.1 does — so comparing numbers first hands out a beta for as
    // long as it is the highest-numbered row.
    const stable = release({ os: 'windows', app_version: '2.0.0', download_url: 'https://x/stable.exe', created_at: '2026-01-01 00:00:00' })
    const laterBeta = release({ os: 'windows', app_version: '2.0.1-beta', download_url: 'https://x/beta.exe', created_at: '2026-01-02 00:00:00' })

    for (const feed of [[stable, laterBeta], [laterBeta, stable]]) {
      expect(latestDesktopDownloads(feed).map((build) => build.app_version)).toEqual(['2.0.0'])
    }
  })

  it('sees a prerelease token behind an architecture that is not one', () => {
    // 1.0.0-x86-rc1 names the architecture first, so reading only the token after
    // the triple calls it stable and hands out a release candidate.
    const stable = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/stable.exe', created_at: '2026-01-01 00:00:00' })
    const rc = release({ os: 'windows', app_version: '1.0.1-x86-rc1', download_url: 'https://x/rc.exe', created_at: '2026-02-01 00:00:00' })

    for (const feed of [[stable, rc], [rc, stable]]) {
      expect(latestDesktopDownloads(feed).map((build) => build.download_url)).toEqual(['https://x/stable.exe'])
    }
  })

  it('sees a prerelease token however the qualifier is spelled', () => {
    // semver's own separator is the dot, and an architecture is as likely to be
    // written x86_64 as x86. Splitting on the hyphen alone left both unread, and
    // the band then offered a release candidate over the stable it precedes.
    const stable = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/stable.exe', created_at: '2026-01-01 00:00:00' })
    for (const spelling of ['1.0.1-x86.rc1', '1.0.1-x86_64-rc1']) {
      const rc = release({ os: 'windows', app_version: spelling, download_url: 'https://x/rc.exe', created_at: '2026-02-01 00:00:00' })
      for (const feed of [[stable, rc], [rc, stable]]) {
        expect(latestDesktopDownloads(feed).map((build) => build.download_url)).toEqual(['https://x/stable.exe'])
      }
    }
  })

  it('does not read a word that merely starts like a qualifier as one', () => {
    const older = release({ os: 'windows', app_version: '1.2.2', download_url: 'https://x/old.exe', created_at: '2026-01-01 00:00:00' })
    const prebuilt = release({ os: 'windows', app_version: '1.2.3-prebuilt', download_url: 'https://x/new.exe', created_at: '2026-02-01 00:00:00' })

    for (const feed of [[older, prebuilt], [prebuilt, older]]) {
      expect(latestDesktopDownloads(feed).map((build) => build.download_url)).toEqual(['https://x/new.exe'])
    }
  })

  it('leaves an architecture that is only an architecture alone', () => {
    const older = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/old.exe', created_at: '2026-01-01 00:00:00' })
    const newer = release({ os: 'windows', app_version: '1.0.1-x64', download_url: 'https://x/new.exe', created_at: '2026-02-01 00:00:00' })

    for (const feed of [[older, newer], [newer, older]]) {
      expect(latestDesktopDownloads(feed).map((build) => build.download_url)).toEqual(['https://x/new.exe'])
    }
  })

  it('reads a prefixed version the same way for the triple and the suffix', () => {
    const offers = latestDesktopDownloads([
      release({ os: 'macos', app_version: 'Octo 2.0.0', download_url: 'https://x/stable.dmg', created_at: '2026-01-01 00:00:00' }),
      release({ os: 'macos', app_version: 'Octo 2.0.0-beta', download_url: 'https://x/beta.dmg', created_at: '2026-01-10 00:00:00' }),
    ])

    expect(offers.map((build) => build.download_url)).toEqual(['https://x/stable.dmg'])
  })

  it('returns the same installer whatever order the feed arrives in', () => {
    // The API sorts by updated_at, so re-saving any row reshuffles the feed.
    const rows = [
      release({ os: 'windows', app_version: '1.0.0(5)', download_url: 'https://x/a.exe', created_at: '2026-01-10 00:00:00' }),
      release({ os: 'windows', app_version: '1.0.0(9)', download_url: 'https://x/b.exe', created_at: '2026-01-02 00:00:00' }),
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/c.exe', created_at: '2026-01-05 00:00:00' }),
      release({ os: 'windows', app_version: 'latest', download_url: 'https://x/d.exe', created_at: '2026-01-03 00:00:00' }),
    ]
    const orders = [rows, [...rows].reverse(), [rows[2], rows[3], rows[0], rows[1]], [rows[3], rows[1], rows[2], rows[0]]]

    for (const feed of orders) {
      expect(latestDesktopDownloads(feed).map((build) => build.download_url)).toEqual(['https://x/b.exe'])
    }
  })

  it('never lets a version it cannot read outrank one it can', () => {
    const offers = latestDesktopDownloads([
      release({ os: 'windows', app_version: 'latest', download_url: 'https://x/latest.exe', created_at: '2026-01-09 00:00:00' }),
      release({ os: 'windows', app_version: '2.0.0', download_url: 'https://x/2.0.0.exe', created_at: '2026-01-01 00:00:00' }),
    ])

    expect(offers.map((build) => build.download_url)).toEqual(['https://x/2.0.0.exe'])
  })

  it('does not let a prerelease displace the stable release it shares a number with', () => {
    const stable = release({ os: 'windows', app_version: '2.0.0', download_url: 'https://x/stable.exe', created_at: '2026-09-01 10:00:00' })
    const beta = release({ os: 'windows', app_version: '2.0.0-beta', download_url: 'https://x/beta.exe', created_at: '2026-09-10 10:00:00' })

    for (const feed of [[beta, stable], [stable, beta]]) {
      expect(latestDesktopDownloads(feed).map((build) => build.app_version)).toEqual(['2.0.0'])
    }
  })

  it('ranks only a recognised suffix as a prerelease', () => {
    // 1.2.3-x64 is an arch, not a release candidate; ranking it below a stable would
    // offer the older 1.2.2 installer instead of the newer build it names.
    const offers = latestDesktopDownloads([
      release({ os: 'windows', app_version: '1.2.3-x64', download_url: 'https://x/new.exe', created_at: '2026-09-01 00:00:00' }),
      release({ os: 'windows', app_version: '1.2.2', download_url: 'https://x/old.exe', created_at: '2026-01-01 00:00:00' }),
    ])

    expect(offers.map((build) => build.download_url)).toEqual(['https://x/new.exe'])
  })

  it('settles rows alike down to the second on something other than arrival order', () => {
    const a = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/a.exe', created_at: '2026-01-01 00:00:00' })
    const b = release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/b.exe', created_at: '2026-01-01 00:00:00' })

    expect(latestDesktopDownloads([a, b])).toEqual(latestDesktopDownloads([b, a]))
  })

  it('still offers a prerelease when it is the only build there is', () => {
    const offers = latestDesktopDownloads([release({ os: 'macos', app_version: '1.0.0-rc1', download_url: 'https://x/rc.dmg' })])
    expect(offers.map((build) => build.app_version)).toEqual(['1.0.0-rc1'])
  })

  it('skips a build whose URL should never reach an href, rather than offering a dead button', () => {
    const offers = latestDesktopDownloads([
      release({ os: 'windows', app_version: '1.1.0', download_url: 'javascript:alert(1)', created_at: '2026-09-01 10:00:00' }),
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/1.0.0.exe', created_at: '2026-08-20 16:00:00' }),
      release({ os: 'macos', app_version: '1.0.0', download_url: '', created_at: '2026-08-20 14:00:00' }),
    ])

    expect(offers.map((build) => [build.os, build.download_url])).toEqual([['windows', 'https://x/1.0.0.exe']])
  })
})

describe('offeredAbove', () => {
  const offer = (os: string, url: string) => ({ os, download_url: url, created_at: '2026-08-20 16:00:00', is_force: 0, update_desc: '', app_version: '1.0.0' })

  it('is true only when every installer the card links is already offered', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/a.exe' }),
      release({ os: 'macos', app_version: '1.0.0', download_url: 'https://x/a.dmg' }),
    ])

    expect(offeredAbove(entry, [offer('windows', 'https://x/a.exe'), offer('macos', 'https://x/a.dmg')])).toBe(true)
    expect(offeredAbove(entry, [offer('windows', 'https://x/a.exe')])).toBe(false)
    expect(offeredAbove(entry, [])).toBe(false)
  })

  it('does not let one platform cover for another that shares its URL', () => {
    const [entry] = groupReleases([
      release({ os: 'windows', app_version: '1.0.0', download_url: 'https://x/universal.zip' }),
      release({ os: 'macos', app_version: '1.0.0', download_url: 'https://x/universal.zip' }),
    ])

    expect(offeredAbove(entry, [offer('windows', 'https://x/universal.zip')])).toBe(false)
  })

  it('is false for a card that has no builds at all', () => {
    const [entry] = groupReleases([release({ os: 'ios', app_version: '3.4.1', download_url: 'https://apps.apple.com/x' })])
    expect(offeredAbove(entry, [offer('windows', 'https://x/a.exe')])).toBe(false)
  })
})

describe('forcedPlatforms', () => {
  const forced = (rows: [string, 0 | 1][]) =>
    forcedPlatforms(groupReleases(rows.map(([os, is_force]) =>
      release({ os, is_force, app_version: '2.0.0', download_url: `https://x/${os}` })))[0])

  it('names the platforms being told to upgrade when the others are not', () => {
    // A macOS visitor reading an unqualified 必须升级 is being told to do something
    // nobody is asking of them.
    expect(forced([['windows', 1], ['macos', 0]])).toEqual(['windows'])
  })

  it('says nothing to qualify when the card speaks for every platform it holds', () => {
    expect(forced([['windows', 1], ['macos', 1]])).toEqual([])
    expect(forced([['windows', 0], ['macos', 0]])).toEqual([])
    // A single build already has its platform named beside the version.
    expect(forced([['windows', 1]])).toEqual([])
  })
})

describe('formatVersion', () => {
  it('normalises what is only written differently', () => {
    expect(formatVersion('1.0')).toBe('1.0.0')
    expect(formatVersion('v2.3.4')).toBe('2.3.4')
    expect(formatVersion('1.0.0(62)')).toBe('1.0.0(62)')
    // A patch number typed as nothing at all.
    expect(formatVersion('1.0.(63)')).toBe('1.0.0(63)')
  })

  it('keeps the qualifier that says which release this is', () => {
    // Dropping it titles a release-candidate card "v1.0.0" — the name of a build
    // that does not exist yet.
    expect(formatVersion('1.0.0-rc1')).toBe('1.0.0-rc1')
    expect(formatVersion('2.0.0-beta.2')).toBe('2.0.0-beta.2')
    expect(formatVersion('1.2.3-x64(9)')).toBe('1.2.3-x64(9)')
    // Build metadata after '+' distinguishes two releases just as a '-' suffix does,
    // now that formatting alike is what decides whether two installers are one.
    expect(formatVersion('1.2.3+arm64')).toBe('1.2.3+arm64')
    // isPrerelease reads underscores in a qualifier; the two readers have to agree,
    // or a card is titled v1.0.0-x86 for a build called 1.0.0-x86_64.
    expect(formatVersion('1.0.0-x86_64')).toBe('1.0.0-x86_64')
    expect(formatVersion('1.0.1_rc1')).toBe('1.0.1_rc1')
  })

  it('does not read the separator of a date-shaped version as a qualifier', () => {
    // isPrerelease splits on the dot as well, but a version is written with dots:
    // accepting one here renders a 2026.04.16 web version as 2026.4.16.16.
    expect(formatVersion('2026.04.16')).toBe('2026.4.16')
    expect(formatVersion('2026.08.03')).toBe('2026.8.3')
  })

  it('hands back a string it cannot read a version out of', () => {
    expect(formatVersion('内测版')).toBe('内测版')
  })
})

describe('offerVersionLabel', () => {
  const offer = (app_version: string) => ({ os: 'windows', app_version, download_url: 'https://x/a.exe', created_at: '2026-08-20 16:00:00', is_force: 0, update_desc: '' })

  it('labels a shared stable version', () => {
    expect(offerVersionLabel([offer('1.0.0'), { ...offer('1.0.0'), os: 'macos' }])).toBe('v1.0.0')
  })

  it('keeps the qualifier rather than badging a prerelease as the stable it is not', () => {
    // The band sits above a button handing over the release candidate; "v1.0.0"
    // there would name a release nobody can download yet.
    expect(offerVersionLabel([offer('1.0.0-rc1')])).toBe('v1.0.0-rc1')
  })

  it('says nothing over a prerelease however its qualifier is spelled', () => {
    // isPrerelease reads _rc1 and .rc1; formatVersion does not read the dot. Asking
    // "do these format alike" first therefore badged v1.0.0 over the button handing
    // out the candidate — the label has to be gated on being one release, not on
    // formatting alike.
    for (const rc of ['1.0.0-rc1', '1.0.0_rc1', '1.0.0.rc1']) {
      expect(offerVersionLabel([offer('1.0.0'), { ...offer(rc), os: 'macos' }])).toBeNull()
    }
  })

  it('still labels a lone prerelease, which misdescribes nothing', () => {
    expect(offerVersionLabel([offer('1.0.0-rc1')])).toBe('v1.0.0-rc1')
    expect(offerVersionLabel([offer('1.0.0-rc1'), { ...offer('1.0.0-rc1'), os: 'macos' }])).toBe('v1.0.0-rc1')
  })

  it('reads two architectures of one version as one release', () => {
    // isPrerelease already says -x64 is an architecture rather than a release
    // distinction; the label has to agree, or the band drops the version line for
    // a release that has one.
    expect(offerVersionLabel([offer('1.0.0-x64'), { ...offer('1.0.0-arm64'), os: 'macos' }])).toBe('v1.0.0')
    // A prerelease among them is a different release, and still says nothing.
    expect(offerVersionLabel([offer('1.0.0-x64'), { ...offer('1.0.0-rc1'), os: 'macos' }])).toBeNull()
  })

  it('says nothing about a version string it cannot read', () => {
    // A "v" in front of free text claims the text is a version.
    expect(offerVersionLabel([offer('内测版')])).toBeNull()
    expect(offerVersionLabel([offer('1.0.0'), { ...offer('内测版'), os: 'macos' }])).toBeNull()
  })

  it('reads one release written two ways as one release', () => {
    expect(offerVersionLabel([offer('1.0'), { ...offer('1.0.0'), os: 'macos' }])).toBe('v1.0.0')
  })

  it('says nothing when one platform is on a prerelease and another is not', () => {
    // Both format to 1.0.0, so a formatted comparison would badge the RC as stable.
    // Asserted in both platform orders, since the label reads from the offer list.
    expect(offerVersionLabel([offer('1.0.0'), { ...offer('1.0.0-rc1'), os: 'macos' }])).toBeNull()
    expect(offerVersionLabel([offer('1.0.0-rc1'), { ...offer('1.0.0'), os: 'macos' }])).toBeNull()
  })

  it('says nothing when two platforms are on different prereleases', () => {
    expect(offerVersionLabel([offer('1.0.0-rc1'), { ...offer('1.0.0-rc2'), os: 'macos' }])).toBeNull()
  })

  it('says nothing when the installers do not share a version', () => {
    expect(offerVersionLabel([offer('1.1.0'), { ...offer('1.0.0'), os: 'macos' }])).toBeNull()
  })

  it('treats versions that format alike as shared', () => {
    expect(offerVersionLabel([offer('1.0.0'), { ...offer('v1.0.0'), os: 'macos' }])).toBe('v1.0.0')
  })
})
