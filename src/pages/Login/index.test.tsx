import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, verifyLogin } from '../../api/auth'
import { ApiError } from '../../api'
import Login from './index'
import type { SessionRestoreState } from './useSessionRestore'

const harness = vi.hoisted(() => {
  class TestApiError extends Error {
    status?: number
    code?: string
    details?: Record<string, unknown>

    constructor(
      message: string,
      status?: number,
      code?: string,
      details?: Record<string, unknown>,
    ) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.code = code
      this.details = details
    }
  }

  return {
    ApiError: TestApiError,
    state: null as SessionRestoreState | null,
    onRestored: null as ((path: string) => void) | null,
    navigate: vi.fn(),
    loginSuper: vi.fn(),
    messageSuccess: vi.fn(),
    messageError: vi.fn(),
    credentials: { username: 'root', password: 'pw' },
  }
})

let formNumber = 0

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
  useTranslation: () => ({
    t: (key: string, values?: { time?: string }) =>
      values?.time ? `${key}:${values.time}` : key,
  }),
}))

vi.mock('../../components/LanguageSwitcher', () => ({ default: () => null }))

vi.mock('../../api', () => ({ ApiError: harness.ApiError }))

vi.mock('../../api/auth', () => ({
  login: vi.fn(),
  getManagerMe: vi.fn(),
  resendLoginCode: vi.fn(),
  sendLoginCode: vi.fn(),
  verifyLogin: vi.fn(),
}))

vi.mock('../../store/auth', () => ({
  useAuthStore: (select: (state: { loginSuper: () => void }) => unknown) =>
    select({ loginSuper: harness.loginSuper }),
}))

vi.mock('@ant-design/icons', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const Icon = () => React.createElement('span', null)
  return {
    ArrowLeftOutlined: Icon,
    LockOutlined: Icon,
    MailOutlined: Icon,
    SafetyCertificateOutlined: Icon,
    UserOutlined: Icon,
  }
})

vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const Box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
  const Button = ({
    children,
    onClick,
    disabled,
    htmlType,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    htmlType?: 'button' | 'submit'
  }) => React.createElement(
    'button',
    { onClick, disabled, type: htmlType === 'submit' ? 'submit' : 'button' },
    children,
  )
  type FormHandle = { kind: 'login' | 'verification'; resetFields: () => void }
  const Form = Object.assign(
    ({
      children,
      form,
      onFinish,
    }: {
      children?: React.ReactNode
      form?: FormHandle
      onFinish?: (values: unknown) => void
    }) => React.createElement(
      'form',
      {
        'data-form': form?.kind,
        onSubmit: (event: React.FormEvent) => {
          event.preventDefault()
          onFinish?.(form?.kind === 'verification' ? { code: '123456' } : harness.credentials)
        },
      },
      children,
    ),
    {
      useForm: () => {
        const ReactWithHooks = React as typeof React & { useRef: typeof React.useRef }
        const kind = ReactWithHooks.useRef(
          formNumber++ === 0 ? 'login' : 'verification',
        ).current as FormHandle['kind']
        return [{ kind, resetFields: vi.fn() }]
      },
      Item: Box,
    },
  )
  const renderInput = (props: React.InputHTMLAttributes<HTMLInputElement> & { prefix?: React.ReactNode }) => {
    const { prefix: _prefix, ...inputProps } = props
    return React.createElement('input', inputProps)
  }
  const Input = Object.assign(renderInput, { Password: renderInput })
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
    formNumber = 0
    vi.useRealTimers()
    vi.mocked(login).mockReset()
    vi.mocked(verifyLogin).mockReset()
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

describe('manager MFA verification lockout', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    harness.state = RESTORE_STATE()
    harness.navigate = vi.fn()
    harness.loginSuper = vi.fn()
    harness.messageSuccess = vi.fn()
    harness.messageError = vi.fn()
    formNumber = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(login).mockResolvedValue({
      challenge_id: 'challenge-1',
      email: 'mxxxxb@example.com',
      expires_in: 900,
      mfa_required: true,
      code_sent: true,
      resend_after: 0,
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  async function openVerificationForm() {
    await act(async () => {
      root.render(<Login />)
      await Promise.resolve()
    })

    const loginForm = container.querySelector('form[data-form="login"]')
    expect(loginForm).toBeTruthy()

    await act(async () => {
      loginForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const verificationForm = container.querySelector('form[data-form="verification"]')
    expect(verificationForm).toBeTruthy()
    return verificationForm as HTMLFormElement
  }

  it('uses retry_after and locks verification controls after the dedicated 429', async () => {
    vi.mocked(verifyLogin).mockRejectedValue(
      new ApiError(
        'Too many incorrect verification attempts.',
        429,
        'err.server.user.manager_mfa_verify_locked',
        { retry_after: 90 },
      ),
    )

    const verificationForm = await openVerificationForm()
    const codeInput = verificationForm.querySelector('input') as HTMLInputElement
    const submitButton = verificationForm.querySelector('button[type="submit"]') as HTMLButtonElement
    const sendButton = verificationForm.querySelector('button:not([type="submit"])') as HTMLButtonElement

    expect(codeInput.disabled).toBe(false)
    expect(submitButton.disabled).toBe(false)

    await act(async () => {
      verificationForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(harness.messageError).toHaveBeenCalledWith('verification.verifyLocked:1:30')
    expect(codeInput.disabled).toBe(true)
    expect(submitButton.disabled).toBe(true)
    expect(sendButton.disabled).toBe(true)
    expect(container.textContent).toContain('verification.verifyLocked:1:30')

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(container.textContent).toContain('verification.verifyLocked:1:29')
  })

  it('handles the legacy rate-limited code used by the deployed server', async () => {
    vi.mocked(verifyLogin).mockRejectedValue(
      new ApiError(
        'The verification code cannot be sent yet.',
        429,
        'err.server.user.manager_mfa_rate_limited',
        {},
      ),
    )

    const verificationForm = await openVerificationForm()

    await act(async () => {
      verificationForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(harness.messageError).toHaveBeenCalledWith('verification.verifyLocked:10:00')
    expect((verificationForm.querySelector('input') as HTMLInputElement).disabled).toBe(true)
  })
})
