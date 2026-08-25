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
    expect(mockedGetManagerMe).toHaveBeenCalledWith({ skipAuthRedirect: true })
    expect(restoredPaths).toEqual(['/dashboard'])
    // 服务端每次 /v1/manager/login 都签发新 token，所以恢复路径必须保住原 token。
    expect(useAuthStore.getState().token).toBe('persisted-token')
    expect(useAuthStore.getState().managerProfileStatus).toBe('loaded')
    expect(useAuthStore.getState().uid).toBe('admin-1')
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
    expect(state?.errorMessage).toBe('bad gateway')
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
    let release: ((me: ManagerMe) => void) | undefined
    mockedGetManagerMe.mockReturnValue(
      new Promise<ManagerMe>((resolve) => {
        release = resolve
      }),
    )

    await mount()
    expect(mockedGetManagerMe).toHaveBeenCalledTimes(1)

    await act(async () => {
      state?.retry()
      state?.retry()
    })

    expect(mockedGetManagerMe).toHaveBeenCalledTimes(1)

    await act(async () => {
      release?.(MANAGER_ME)
    })

    expect(restoredPaths).toEqual(['/dashboard'])
  })

  it('survives a rejection that is not an Error', async () => {
    mockedGetManagerMe.mockRejectedValue('boom')

    await mount()

    expect(state?.status).toBe('error')
    expect(state?.errorMessage).toBe('')
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
