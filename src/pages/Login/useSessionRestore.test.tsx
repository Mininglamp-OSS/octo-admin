import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api'
import { normalizeManagerCapabilities, type ManagerMe } from '../../auth/capabilities'
import { getManagerMe } from '../../api/auth'
import { useAuthStore } from '../../store/auth'
import { useSessionRestore, type SessionRestoreState } from './useSessionRestore'

vi.mock('../../api/auth', () => ({
  getManagerMe: vi.fn(),
  login: vi.fn(),
}))

const mockedGetManagerMe = vi.mocked(getManagerMe)

const MANAGER_ME: ManagerMe = {
  uid: 'admin-1',
  name: 'Root',
  role: 'superAdmin',
  capabilities: normalizeManagerCapabilities({ 'dashboard.read': true }),
}

let state: SessionRestoreState | null = null
let restoredPaths: string[] = []

function Probe() {
  state = useSessionRestore((path) => {
    restoredPaths.push(path)
  })
  return null
}

/** 手动控制的探测:让测试决定它什么时候、以什么结果收敛。 */
function deferredProbe() {
  let settle!: (me: ManagerMe) => void
  const promise = new Promise<ManagerMe>((resolve) => {
    settle = resolve
  })
  mockedGetManagerMe.mockReturnValue(promise)
  return { settle }
}

describe('useSessionRestore', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = async () => {
    await act(async () => {
      root.render(<Probe />)
    })
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    state = null
    restoredPaths = []
    mockedGetManagerMe.mockReset()
    useAuthStore.setState({
      scope: 'super',
      token: 'persisted-token',
      name: 'Root',
      role: 'superAdmin',
      uid: '',
      isLoggedIn: true,
      managerCapabilities: null,
      managerProfileStatus: 'idle',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('skips the probe when no manager token is persisted', async () => {
    useAuthStore.setState({ scope: '', token: '', isLoggedIn: false })

    await mount()

    expect(mockedGetManagerMe).not.toHaveBeenCalled()
    expect(state?.status).toBe('form')
  })

  it('skips the probe for a space-scoped session', async () => {
    useAuthStore.setState({ scope: 'space' })

    await mount()

    expect(mockedGetManagerMe).not.toHaveBeenCalled()
    expect(state?.status).toBe('form')
  })

  it('skips the probe when a stale token outlives the logged-in flag', async () => {
    // 否则:探测成功 → 跳 /dashboard → SuperOnlyRoute 打回 /login → 再探测。
    useAuthStore.setState({ isLoggedIn: false })

    await mount()

    expect(mockedGetManagerMe).not.toHaveBeenCalled()
    expect(state?.status).toBe('form')
  })

  it('restores a live session instead of re-submitting the login form', async () => {
    mockedGetManagerMe.mockResolvedValue(MANAGER_ME)

    await mount()

    expect(mockedGetManagerMe).toHaveBeenCalledTimes(1)
    expect(mockedGetManagerMe).toHaveBeenCalledWith(
      expect.objectContaining({ skipAuthRedirect: true }),
    )
    expect(restoredPaths).toEqual(['/dashboard'])
    // 服务端每次 /v1/manager/login 都签发新 token，所以恢复路径必须保住原 token。
    expect(useAuthStore.getState().token).toBe('persisted-token')
    expect(useAuthStore.getState().managerProfileStatus).toBe('loaded')
    expect(useAuthStore.getState().uid).toBe('admin-1')
  })

  it('fails fast rather than holding the operator on a spinner', async () => {
    deferredProbe()

    await mount()

    const options = mockedGetManagerMe.mock.calls[0][0]
    expect(options?.skipAuthRedirect).toBe(true)
    // 恢复会话只是省掉一次本来就能用的表单，后端慢时必须比共享客户端的
    // 30s 默认超时早得多地放弃。
    expect(options?.timeoutMs).toBeGreaterThan(0)
    expect(options?.timeoutMs).toBeLessThan(30_000)
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  })

  it('abandons an in-flight probe when the operator opts for the password form', async () => {
    const { settle } = deferredProbe()
    await mount()
    expect(state?.status).toBe('checking')

    await act(async () => {
      state?.dismiss()
    })
    expect(state?.status).toBe('form')
    expect(mockedGetManagerMe.mock.calls[0][0]?.signal?.aborted).toBe(true)

    // 用户已经在表单上打字了，迟到的成功响应不能再把他带走。
    await act(async () => {
      settle(MANAGER_ME)
    })
    expect(restoredPaths).toEqual([])
    expect(state?.status).toBe('form')
    expect(useAuthStore.getState().token).toBe('persisted-token')
  })

  it('gives a demoted admin a terminal state instead of outage copy', async () => {
    mockedGetManagerMe.mockRejectedValue(new ApiError('forbidden', 403))

    await mount()

    expect(state?.status).toBe('forbidden')
    // 403 的 token 本身是有效的，清掉它没有意义。
    expect(useAuthStore.getState().token).toBe('persisted-token')

    await act(async () => {
      state?.signOut()
    })
    expect(state?.status).toBe('form')
    expect(useAuthStore.getState().token).toBe('')
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
  })

  it('clears the credential on 401 and falls back to the form', async () => {
    mockedGetManagerMe.mockRejectedValue(new ApiError('unauthorized', 401))

    await mount()

    expect(state?.status).toBe('form')
    expect(useAuthStore.getState().token).toBe('')
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
    expect(restoredPaths).toEqual([])
  })

  it('keeps the credential when the backend fails without a verdict', async () => {
    mockedGetManagerMe.mockRejectedValue(new ApiError('bad gateway', 502))

    await mount()

    expect(state?.status).toBe('error')
    expect(state?.errorDetail).toBe('bad gateway')
    expect(useAuthStore.getState().token).toBe('persisted-token')
    expect(useAuthStore.getState().isLoggedIn).toBe(true)
  })

  it('restores on retry after a transient failure', async () => {
    mockedGetManagerMe.mockRejectedValueOnce(new ApiError('Network Error'))
    await mount()
    expect(state?.status).toBe('error')

    mockedGetManagerMe.mockResolvedValueOnce(MANAGER_ME)
    await act(async () => {
      state?.retry()
    })

    expect(restoredPaths).toEqual(['/dashboard'])
    expect(useAuthStore.getState().token).toBe('persisted-token')
  })

  it('ignores a retry while a probe is still in flight', async () => {
    const { settle } = deferredProbe()

    await mount()
    expect(mockedGetManagerMe).toHaveBeenCalledTimes(1)

    await act(async () => {
      state?.retry()
      state?.retry()
    })

    expect(mockedGetManagerMe).toHaveBeenCalledTimes(1)

    await act(async () => {
      settle(MANAGER_ME)
    })

    expect(restoredPaths).toEqual(['/dashboard'])
  })

  it('survives a rejection that is not an Error', async () => {
    mockedGetManagerMe.mockRejectedValue('boom')

    await mount()

    expect(state?.status).toBe('error')
    expect(state?.errorDetail).toBe('')
    expect(useAuthStore.getState().token).toBe('persisted-token')
  })

  it('lets the operator fall back to the form without dropping the credential', async () => {
    mockedGetManagerMe.mockRejectedValue(new ApiError('bad gateway', 502))
    await mount()

    await act(async () => {
      state?.dismiss()
    })

    expect(state?.status).toBe('form')
    expect(useAuthStore.getState().token).toBe('persisted-token')
  })
})
