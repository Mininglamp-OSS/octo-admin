import { describe, expect, it } from 'vitest'
import { parseContributors } from './utils'

describe('parseContributors', () => {
  it('uses GitHub profile avatars for changelog contributors', () => {
    expect(parseContributors('@contributors: caster-Q, @octocat')).toEqual([
      {
        name: 'caster-Q',
        avatar: 'https://github.com/caster-Q.png?size=48',
      },
      {
        name: '@octocat',
        avatar: 'https://github.com/octocat.png?size=48',
      },
    ])
  })
})
