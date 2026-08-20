import { describe, expect, it } from 'vitest'
import { getVersionSeverity, parseContributors, parseUpdateDesc } from './utils'

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

  it('still treats an older first-seen version as a patch', () => {
    expect(getVersionSeverity('3.2.1')).toBe('patch')
  })
})
