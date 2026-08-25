import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import api, { ApiError } from './index'
import { classifyRestoreFailure } from '../pages/Login/sessionRestore'
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

  it('hands the login probe a classifiable error for the 403 octo-server really sends', async () => {
    // /v1/manager/me 的 forbidden 走 respondManagerForbidden → ResponseErrorL，
    // wire 状态被 D14 钉死在 400、403 只在信封里。octo-server 自己的
    // api_manager_me_test.go 断言了 w.Code == 400。这条把「拦截器产出的形状」
    // 和「分类器读到的结论」接起来，免得两边各自对着一个想象中的形状测。
    api.defaults.adapter = rejectWith(400, {
      error: {
        code: 'err.shared.auth.forbidden',
        http_status: 403,
        message: '该用户无权执行此操作',
      },
    })

    const error = await api.get('/v1/manager/me', { skipAuthRedirect: true }).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.transportStatus).toBe(400)
    expect(error.status).toBe(403)
    expect(classifyRestoreFailure(error)).toBe('forbidden')
    // 授权被拒不等于凭据失效，凭据必须留着。
    expect(useAuthStore.getState().token).toBe('live-token')
  })

  it('hands the login probe an expired verdict for the bare 401 octo-lib really sends', async () => {
    // AuthMiddleware 的响应体是裸 msg，没有 error 信封。
    api.defaults.adapter = rejectWith(401, { msg: 'token不能为空，请先登录！' })

    const error = await api.get('/v1/manager/me', { skipAuthRedirect: true }).catch((e) => e)

    expect(error.transportStatus).toBe(401)
    expect(classifyRestoreFailure(error)).toBe('expired')
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
