import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import { classifyRestoreFailure } from './sessionRestore'

describe('classifyRestoreFailure', () => {
  it('treats 401 as an expired credential', () => {
    expect(classifyRestoreFailure(new ApiError('unauthorized', 401))).toBe('expired')
  })

  it('keeps the credential when the server never gave a verdict', () => {
    expect(classifyRestoreFailure(new ApiError('bad gateway', 502))).toBe('retryable')
    expect(classifyRestoreFailure(new ApiError('server error', 500))).toBe('retryable')
    expect(classifyRestoreFailure(new ApiError('Network Error'))).toBe('retryable')
    expect(classifyRestoreFailure(new Error('timeout'))).toBe('retryable')
    expect(classifyRestoreFailure(undefined)).toBe('retryable')
  })

  it('keeps a valid-but-underprivileged credential', () => {
    expect(classifyRestoreFailure(new ApiError('forbidden', 403))).toBe('retryable')
  })
})
