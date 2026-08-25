import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login } from '../../api/auth'
import Login from './index'
import type { SessionRestoreState } from './useSessionRestore'

const harness = vi.hoisted(() => ({
  state: null as SessionRestoreState | null,
  onRestored: null as ((path: string) => void) | null,
  navigate: vi.fn(),
  loginSuper: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  credentials: { username: 'root', password: 'pw' },
}))

vi.mock('./useSessionRestore', () => ({
  useSessionRestore: (onRestored: (path: string) => void) => {
    harness.onRestored = onRestored
    return harness.state
  },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => harness.navigate,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../components/LanguageSwitcher', () => ({ default: () => null }))

vi.mock('../../api/auth', () => ({ login: vi.fn(), getManagerMe: vi.fn() }))

vi.mock('../../store/auth', () => ({
  useAuthStore: (select: (state: { loginSuper: () => void }) => unknown) =>
    select({ loginSuper: harness.loginSuper }),
}))

vi.mock('@ant-design/icons', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const Icon = () => React.createElement('span', null)
  return { UserOutlined: Icon, LockOutlined: Icon }
})

vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const Box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
  const Button = ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
    React.createElement('button', { onClick }, children)
  const Form = ({ children, onFinish }: { children?: React.ReactNode; onFinish?: (values: unknown) => void }) =>
    React.createElement(
      'form',
      {
        onSubmit: (event: React.FormEvent) => {
          event.preventDefault()
          onFinish?.(harness.credentials)
        },
      },
      children,
    )
  Form.Item = Box
  const Input = () => React.createElement('input', null)
  Input.Password = () => React.createElement('input', { type: 'password' })
  // 真实的 antd Alert 根节点自带 role="alert"，mock 必须照抄这个契约，
  // 否则组件里多包一层 role="alert" 也测不出来。
  const Alert = ({ message, description }: { message?: React.ReactNode; description?: React.ReactNode }) =>
    React.createElement('div', { role: 'alert' }, message, description)
  return {
    Alert,
    Button,
    Card: Box,
    Form,
    Input,
    Spin: () => React.createElement('span', null),
    // 转发而不是直接引用：beforeEach 会换掉 harness 上的 spy，
    // 工厂只在模块 mock 时求值一次。
    message: {
      error: (...args: unknown[]) => harness.messageError(...args),
      success: (...args: unknown[]) => harness.messageSuccess(...args),
    },
  }
})

const RESTORE_STATE = (overrides: Partial<SessionRestoreState> = {}): SessionRestoreState => ({
  status: 'form',
  errorDetail: '',
  retry: vi.fn(),
  dismiss: vi.fn(),
  signOut: vi.fn(),
  ...overrides,
})

describe('Login page states', () => {
  let container: HTMLDivElement
  let root: Root

  const render = () => {
    act(() => {
      root.render(<Login />)
    })
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    harness.state = RESTORE_STATE()
    harness.onRestored = null
    harness.navigate = vi.fn()
    harness.loginSuper = vi.fn()
    harness.messageSuccess = vi.fn()
    harness.messageError = vi.fn()
    vi.mocked(login).mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('announces the restore probe instead of showing the form', () => {
    harness.state = RESTORE_STATE({ status: 'checking' })

    render()

    const status = container.querySelector('[role="status"]')
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(status?.textContent).toContain('restore.checking')
    expect(container.querySelector('form')).toBeNull()
  })

  // 探测成功时 hook 刻意不把 status 从 checking 收敛掉（见
  // useSessionRestore.test.tsx），页面靠调用方导航离开。所以这个逃生口不是
  // 锦上添花：少了它，导航一旦没发生，checking 就是个走不出去的死局。
  it('offers a way out of the probe rather than trapping the operator on a spinner', () => {
    const dismiss = vi.fn()
    harness.state = RESTORE_STATE({ status: 'checking', dismiss })

    render()

    const escape = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'restore.usePassword',
    )
    expect(escape).toBeTruthy()

    act(() => {
      escape?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('gives a demoted admin its own copy and a terminal exit', () => {
    const signOut = vi.fn()
    harness.state = RESTORE_STATE({ status: 'forbidden', signOut })

    render()

    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('restore.forbidden.title')
    // 不能复用「服务器联系不上」的文案 —— 那不是发生的事。
    expect(container.textContent).not.toContain('restore.error.description')
    expect(container.querySelector('form')).toBeNull()

    const exit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'restore.signOut',
    )
    act(() => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('shows the credentials form when there is nothing to restore', () => {
    render()

    expect(container.querySelector('form')).not.toBeNull()
    expect(container.textContent).toContain('submit')
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('reports a failed probe through an alert and wires both recovery actions', () => {
    const retry = vi.fn()
    const dismiss = vi.fn()
    harness.state = RESTORE_STATE({ status: 'error', errorDetail: 'Network Error', retry, dismiss })

    render()

    // 恰好一个:嵌套的 live region 会被读屏播报两遍。
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1)
    const alertText = container.querySelector('[role="alert"]')?.textContent ?? ''
    // 本地化文案是主信息,axios 的英文串只是附带的细节 —— 不能反过来。
    expect(alertText).toContain('restore.error.description')
    expect(alertText).toContain('Network Error')
    // 探测失败时绝不能露出表单：再登一次就是服务端多一个 session。
    expect(container.querySelector('form')).toBeNull()

    const buttons = Array.from(container.querySelectorAll('button'))
    const retryButton = buttons.find((b) => b.textContent === 'restore.retry')
    const passwordButton = buttons.find((b) => b.textContent === 'restore.usePassword')

    act(() => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      passwordButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(retry).toHaveBeenCalledTimes(1)
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('shows only the localized copy when there is no detail to add', () => {
    harness.state = RESTORE_STATE({ status: 'error', errorDetail: '' })

    render()

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'restore.error.titlerestore.error.description',
    )
  })

  it('still signs in with a password when there is no session to restore', async () => {
    vi.mocked(login).mockResolvedValue({ token: 'fresh-token', name: 'Root', role: 'superAdmin' })

    render()
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(login).toHaveBeenCalledWith(harness.credentials)
    expect(harness.loginSuper).toHaveBeenCalledWith('fresh-token', 'Root', 'superAdmin')
    expect(harness.navigate).toHaveBeenCalledWith('/dashboard')
  })

  it('surfaces a failed password sign-in without navigating', async () => {
    vi.mocked(login).mockRejectedValue(new Error('invalid credentials'))

    render()
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(harness.messageError).toHaveBeenCalledWith('invalid credentials')
    expect(harness.loginSuper).not.toHaveBeenCalled()
    expect(harness.navigate).not.toHaveBeenCalled()
  })

  it('replaces history when a restored session navigates away', () => {
    render()

    act(() => {
      harness.onRestored?.('/dashboard')
    })

    expect(harness.navigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })
})
