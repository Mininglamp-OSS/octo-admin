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
})
