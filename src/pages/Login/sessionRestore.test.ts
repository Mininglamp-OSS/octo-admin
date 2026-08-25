import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import { classifyRestoreFailure } from './sessionRestore'

describe('classifyRestoreFailure', () => {
  it('treats 401 as an expired credential', () => {
    expect(classifyRestoreFailure(new ApiError('unauthorized', 401))).toBe('expired')
  })

  it('treats 403 as a valid credential that lost its privileges', () => {
    expect(classifyRestoreFailure(new ApiError('forbidden', 403))).toBe('forbidden')
  })

  it('keeps the credential when the server never gave a verdict', () => {
    expect(classifyRestoreFailure(new ApiError('bad gateway', 502))).toBe('retryable')
    expect(classifyRestoreFailure(new ApiError('server error', 500))).toBe('retryable')
    expect(classifyRestoreFailure(new ApiError('Network Error'))).toBe('retryable')
    expect(classifyRestoreFailure(new Error('timeout'))).toBe('retryable')
    expect(classifyRestoreFailure(undefined)).toBe('retryable')
  })

  it('judges on the transport status, not the error envelope', () => {
    // octo-server 有一部分端点把 wire 状态钉死在 400、真实状态只放信封里
    // (pkg/errcode/messages_search.go)，所以两者会不一致。
    // 「凭据是不是被拒了」必须问传输层，跟 401 拦截器保持同一个答案。
    const envelopeSays503 = new ApiError('x', 503, undefined, undefined, 401)
    expect(classifyRestoreFailure(envelopeSays503)).toBe('expired')

    const envelopeSays401 = new ApiError('x', 401, undefined, undefined, 400)
    expect(classifyRestoreFailure(envelopeSays401)).toBe('retryable')
  })
})
