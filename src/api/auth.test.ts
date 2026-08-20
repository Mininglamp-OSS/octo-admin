import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()

vi.mock('./index', () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}))

import { login, resendLoginCode, sendLoginCode, verifyLogin } from './auth'

describe('manager login API', () => {
  beforeEach(() => {
    post.mockReset()
  })

  it('starts a login challenge without treating it as a token response', async () => {
    const challenge = {
      challenge_id: 'challenge-1',
      email: 'a****@example.com',
      expires_in: 300,
      code_sent: false,
      resend_after: 0,
    }
    post.mockResolvedValue({ data: challenge })

    await expect(login({ username: 'admin', password: 'password' })).resolves.toEqual(challenge)
    expect(post).toHaveBeenCalledWith('/v1/manager/login', {
      username: 'admin',
      password: 'password',
    })
  })

  it('verifies a challenge and returns the final manager session', async () => {
    const session = { token: 'token-1', name: 'Admin', role: 'superAdmin' }
    post.mockResolvedValue({ data: session })

    await expect(
      verifyLogin({ challenge_id: 'challenge-1', code: '123456' }),
    ).resolves.toEqual(session)
    expect(post).toHaveBeenCalledWith('/v1/manager/login/verify', {
      challenge_id: 'challenge-1',
      code: '123456',
    })
  })

  it('sends the first code only after an explicit request', async () => {
    const challenge = {
      challenge_id: 'challenge-1',
      email: 'a****@example.com',
      expires_in: 299,
      code_sent: true,
      resend_after: 60,
    }
    post.mockResolvedValue({ data: challenge })

    await expect(sendLoginCode('challenge-1')).resolves.toEqual(challenge)
    expect(post).toHaveBeenCalledWith('/v1/manager/login/send', {
      challenge_id: 'challenge-1',
    })
  })

  it('resends a code for the current challenge', async () => {
    const challenge = {
      challenge_id: 'challenge-1',
      email: 'a****@example.com',
      expires_in: 300,
      code_sent: true,
      resend_after: 60,
    }
    post.mockResolvedValue({ data: challenge })

    await expect(resendLoginCode('challenge-1')).resolves.toEqual(challenge)
    expect(post).toHaveBeenCalledWith('/v1/manager/login/resend', {
      challenge_id: 'challenge-1',
    })
  })
})
