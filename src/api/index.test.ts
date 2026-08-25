import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import api, { ApiError } from './index'
import { useAuthStore } from '../store/auth'

const LOGGED_IN = {
  scope: 'super' as const,
  token: 'live-token',
  name: 'Root',
  role: 'superAdmin',
  uid: 'admin-1',
  isLoggedIn: true,
}

describe('api 401 handling', () => {
  const originalAdapter = api.defaults.adapter
  const originalLocation = window.location

  const rejectWith = (status: number, data: unknown) =>
    async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('request failed', 'ERR_BAD_REQUEST', config, null, {
        status,
        statusText: 'Error',
        data,
        headers: {},
        config,
      })
    }

  beforeEach(() => {
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401,
        statusText: 'Unauthorized',
        data: {},
        headers: {},
        config,
      })
    }
    Object.defineProperty(window, 'location', { writable: true, value: { href: '' } })
    useAuthStore.setState(LOGGED_IN)
  })

  afterEach(() => {
    api.defaults.adapter = originalAdapter
    Object.defineProperty(window, 'location', { writable: true, value: originalLocation })
  })

  it('revokes the local credential and bounces to the login page by default', async () => {
    await expect(api.get('/v1/manager/me')).rejects.toBeInstanceOf(ApiError)

    expect(useAuthStore.getState().token).toBe('')
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
    expect(window.location.href).toBe('/admin/login')
  })

  it('hands 401 back to the caller when skipAuthRedirect is set', async () => {
    // 登录页的会话探测靠这个自己判：只有 401 才清凭据，网络/5xx 要保留。
    await expect(api.get('/v1/manager/me', { skipAuthRedirect: true })).rejects.toMatchObject({
      status: 401,
    })

    expect(useAuthStore.getState().token).toBe('live-token')
    expect(useAuthStore.getState().isLoggedIn).toBe(true)
    expect(window.location.href).toBe('')
  })

  it('revokes on the transport status even when the envelope disagrees', async () => {
    // octo-server 的部分端点用 httperr.ResponseErrorL 渲染，wire 状态被钉死、
    // 真实状态只在 error.http_status 里，两者会不一致。撤销与否只看传输层。
    api.defaults.adapter = rejectWith(401, {
      error: { code: 'err.shared.auth.required', http_status: 503, message: '请先登录！' },
    })

    await expect(api.get('/v1/manager/me')).rejects.toMatchObject({
      status: 503,
      transportStatus: 401,
      message: '请先登录！',
    })

    expect(useAuthStore.getState().token).toBe('')
    expect(window.location.href).toBe('/admin/login')
  })

  it('does not revoke on a wire 400 whose envelope claims 401', async () => {
    api.defaults.adapter = rejectWith(400, {
      error: { code: 'err.server.messages_search.validation_failed', http_status: 401, message: 'bad' },
    })

    await expect(api.get('/v1/manager/me')).rejects.toMatchObject({
      status: 401,
      transportStatus: 400,
    })

    expect(useAuthStore.getState().token).toBe('live-token')
    expect(window.location.href).toBe('')
  })
})
