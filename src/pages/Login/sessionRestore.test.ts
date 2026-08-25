import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import { classifyRestoreFailure } from './sessionRestore'

/**
 * octo-server 对 /v1/manager/me 的两种拒绝，按它们真正上线的形状构造。
 *
 * 用 `new ApiError('forbidden', 403)` 这种手搓形状测过一版，它让构造函数把
 * transportStatus 默认成了 403 —— 一个后端从不发出的组合，于是 forbidden 分支
 * 明明是死代码，测试却全绿。
 */
const WIRE = {
  // octo-lib AuthMiddleware：货真价实的 wire 401，响应体是裸 msg，没有信封。
  unauthenticated: () => new ApiError('请先登录！', 401, undefined, undefined, 401),
  // respondManagerForbidden → ResponseErrorL：wire 钉死 400，403 只在信封里(D14)。
  forbidden: () =>
    new ApiError('无权执行此操作', 403, 'err.shared.auth.forbidden', undefined, 400),
}

describe('classifyRestoreFailure', () => {
  it('treats a real wire 401 as an expired credential', () => {
    expect(classifyRestoreFailure(WIRE.unauthenticated())).toBe('expired')
  })

  it('recognises the wire-pinned 403 octo-server actually sends', () => {
    expect(classifyRestoreFailure(WIRE.forbidden())).toBe('forbidden')
  })

  it('still recognises a 403 if that endpoint ever moves to a semantic wire status', () => {
    // 后端若把 me() 改成 ResponseErrorLWithStatus，两个轴都会是 403。
    expect(
      classifyRestoreFailure(new ApiError('无权执行此操作', 403, 'err.shared.auth.forbidden', undefined, 403)),
    ).toBe('forbidden')
  })

  it('keeps the credential when the server never gave a verdict', () => {
    expect(classifyRestoreFailure(new ApiError('bad gateway', 502, undefined, undefined, 502))).toBe('retryable')
    expect(classifyRestoreFailure(new ApiError('server error', 500, undefined, undefined, 500))).toBe('retryable')
    expect(classifyRestoreFailure(new ApiError('Network Error'))).toBe('retryable')
    expect(classifyRestoreFailure(new Error('timeout'))).toBe('retryable')
    expect(classifyRestoreFailure(undefined)).toBe('retryable')
  })

  it('asks the transport, not the envelope, whether the credential itself was rejected', () => {
    // 撤销与否必须和 api/index.ts 的 401 拦截器同一个判据。
    const wire401EnvelopeSays503 = new ApiError('x', 503, undefined, undefined, 401)
    expect(classifyRestoreFailure(wire401EnvelopeSays503)).toBe('expired')

    const wire400EnvelopeSays401 = new ApiError('x', 401, undefined, undefined, 400)
    expect(classifyRestoreFailure(wire400EnvelopeSays401)).toBe('retryable')
  })
})
