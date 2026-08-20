import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Spin, Alert, message } from 'antd'
import { ArrowLeftOutlined, LockOutlined, MailOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { login, resendLoginCode, sendLoginCode, verifyLogin, type LoginChallengeResponse, type ManagerLoginResult } from '../../api/auth'
import { ApiError } from '../../api'
import { useAuthStore } from '../../store/auth'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { useSessionRestore } from './useSessionRestore'

export default function Login() {
  const navigate = useNavigate()
  const { status, errorDetail, retry, dismiss, signOut } = useSessionRestore(
    useCallback((path: string) => navigate(path, { replace: true }), [navigate]),
  )

  return (
    <LoginShell>
      {status === 'checking' && <RestoringBody onDismiss={dismiss} />}
      {status === 'error' && (
        <RestoreErrorBody detail={errorDetail} onRetry={retry} onDismiss={dismiss} />
      )}
      {status === 'forbidden' && <RestoreForbiddenBody onSignOut={signOut} />}
      {status === 'form' && <CredentialsForm />}
    </LoginShell>
  )
}

// 探测态也给出口。它只是一个延迟优化，后端慢的时候不该把人扣在转圈上 ——
// 改动之前表单是立刻可用的，这里不能比之前更差。
function RestoringBody({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation('login')
  return (
    <>
      <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: '24px 0 8px' }}>
        {/* antd 的 Spin 根节点自带 aria-live="polite"，套在外层 status 里就成了
            嵌套 live region。转圈只是装饰，要播报的是下面那行文案。 */}
        <span aria-hidden="true">
          <Spin />
        </span>
        <p style={{ marginTop: 16, marginBottom: 0, color: 'var(--a-text-tertiary)', fontSize: 13 }}>
          {t('restore.checking')}
        </p>
      </div>
      <Button type="link" block onClick={onDismiss}>
        {t('restore.usePassword')}
      </Button>
    </>
  )
}

interface RestoreErrorBodyProps {
  detail: string
  onRetry: () => void
  onDismiss: () => void
}

function RestoreErrorBody({ detail, onRetry, onDismiss }: RestoreErrorBodyProps) {
  const { t } = useTranslation('login')
  // antd 的 Alert 根节点已经是 role="alert"，不再外包一层，否则读屏会拿到
  // 两个嵌套的 alert 区域；两个恢复按钮也不该被卷进 live region 里播报。
  return (
    <>
      <Alert
        type="warning"
        showIcon
        message={t('restore.error.title')}
        // 本地化文案是主信息。原始报错留在下面一行:这里能拿到的多半是 axios
        // 自己的英文串(Network Error / timeout of 8000ms exceeded),让它盖掉
        // 中文正文是本末倒置,但完全丢掉又会让人没法判断到底出了什么事。
        description={
          <>
            {t('restore.error.description')}
            {detail ? (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  opacity: 0.75,
                  wordBreak: 'break-word',
                }}
              >
                {detail}
              </div>
            ) : null}
          </>
        }
        style={{ marginBottom: 16 }}
      />
      <Button type="primary" block size="large" onClick={onRetry}>
        {t('restore.retry')}
      </Button>
      <Button type="link" block onClick={onDismiss} style={{ marginTop: 8 }}>
        {t('restore.usePassword')}
      </Button>
    </>
  )
}

// 403：token 是有效的，只是这个账号不再有管理端权限。不能套用「服务器联系
// 不上」那套文案 —— 那与事实不符，而且会让人一直点重试。这里给一个终态。
function RestoreForbiddenBody({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation('login')
  return (
    <>
      <Alert
        type="error"
        showIcon
        message={t('restore.forbidden.title')}
        description={t('restore.forbidden.description')}
        style={{ marginBottom: 16 }}
      />
      <Button type="primary" block size="large" onClick={onSignOut}>
        {t('restore.signOut')}
      </Button>
    </>
  )
}

interface LoginForm {
  username: string
  password: string
}

interface VerificationForm {
  code: string
}

const resendCooldownSeconds = 2 * 60

function formatRemainingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function retryAfterFromError(error: unknown) {
  if (!(error instanceof ApiError)) return null
  const retryAfter = Number(error.details?.retry_after)
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : null
}

function isManagerLoginChallenge(data: ManagerLoginResult): data is LoginChallengeResponse {
  return 'challenge_id' in data && Boolean(data.challenge_id)
}

function CredentialsForm() {
  const [loading, setLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [challenge, setChallenge] = useState<LoginChallengeResponse | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [loginForm] = Form.useForm<LoginForm>()
  const [verificationForm] = Form.useForm<VerificationForm>()
  const navigate = useNavigate()
  const authLogin = useAuthStore((state) => state.loginSuper)
  const { t } = useTranslation('login')

  useEffect(() => {
    if (!challenge) {
      setRemainingSeconds(0)
      setResendSeconds(0)
      return
    }

    setRemainingSeconds(challenge.expires_in)
    const timer = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(seconds - 1, 0))
      setResendSeconds((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [challenge])

  const onLogin = async (values: LoginForm) => {
    setLoading(true)
    try {
      const data = await login(values)
      if (isManagerLoginChallenge(data)) {
        setChallenge(data)
        loginForm.resetFields()
        verificationForm.resetFields()
        message.success(t('verification.challengeCreated'))
        return
      }
      authLogin(data.token, data.name, data.role)
      message.success(t('success'))
      navigate('/dashboard')
    } catch (error) {
      message.error((error as Error).message || t('failure'))
    } finally {
      setLoading(false)
    }
  }

  const onSendCode = async () => {
    if (!challenge || remainingSeconds <= 0 || resendSeconds > 0) return

    const isResend = challenge.code_sent
    setSendLoading(true)
    try {
      const data = isResend
        ? await resendLoginCode(challenge.challenge_id)
        : await sendLoginCode(challenge.challenge_id)
      setChallenge(data)
      setResendSeconds(resendCooldownSeconds)
      verificationForm.resetFields()
      message.success(t(isResend ? 'verification.resent' : 'verification.sent'))
    } catch (error) {
      if (error instanceof ApiError && error.code === 'err.server.user.manager_login_challenge_invalid') {
        resetChallenge()
        message.error(t('verification.invalid'))
        return
      }
      const retryAfter = retryAfterFromError(error)
      if (retryAfter !== null) {
        const cooldown = Math.max(resendCooldownSeconds, retryAfter)
        setResendSeconds(cooldown)
        message.error(t('verification.rateLimited', { time: formatRemainingTime(cooldown) }))
        return
      }
      message.error((error as Error).message || t('verification.sendFailure'))
    } finally {
      setSendLoading(false)
    }
  }

  const onVerify = async (values: VerificationForm) => {
    if (!challenge || !challenge.code_sent || remainingSeconds <= 0) return

    setLoading(true)
    try {
      const data = await verifyLogin({
        challenge_id: challenge.challenge_id,
        code: values.code,
      })
      authLogin(data.token, data.name, data.role)
      message.success(t('success'))
      navigate('/dashboard')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'err.server.user.manager_login_challenge_invalid') {
        resetChallenge()
        message.error(t('verification.invalid'))
        return
      }
      message.error((error as Error).message || t('verification.failure'))
    } finally {
      setLoading(false)
    }
  }

  const backToLogin = () => {
    resetChallenge()
  }

  function resetChallenge() {
    setChallenge(null)
    verificationForm.resetFields()
    loginForm.resetFields()
    setResendSeconds(0)
  }

  return (
    <>
      {challenge ? (
        <>
          <div style={{ textAlign: 'center', marginBottom: 20, color: 'var(--a-text-secondary)' }}>
            <MailOutlined style={{ marginRight: 6 }} />
            {t(
              challenge.code_sent ? 'verification.description' : 'verification.readyDescription',
              { email: challenge.email },
            )}
          </div>
          <Form form={verificationForm} onFinish={onVerify} size="large">
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Form.Item
                name="code"
                rules={[
                  { required: true, message: t('verification.code.required') },
                  { pattern: /^\d{6}$/, message: t('verification.code.invalid') },
                ]}
                style={{ flex: 1, marginBottom: 12 }}
              >
                <Input
                  prefix={<SafetyCertificateOutlined />}
                  placeholder={t('verification.code.placeholder')}
                  inputMode="numeric"
                  maxLength={6}
                  disabled={!challenge.code_sent || remainingSeconds <= 0}
                />
              </Form.Item>
              <Button
                type={challenge.code_sent ? 'default' : 'primary'}
                onClick={onSendCode}
                loading={sendLoading}
                disabled={
                  loading || sendLoading || remainingSeconds <= 0 ||
                  resendSeconds > 0
                }
                style={{ minWidth: 136 }}
              >
                {resendSeconds > 0
                  ? t(
                    challenge.code_sent ? 'verification.resendAfter' : 'verification.sendAfter',
                    { time: formatRemainingTime(resendSeconds) },
                  )
                  : challenge.code_sent
                    ? t('verification.resend')
                    : t('verification.send')}
              </Button>
            </div>
            <Form.Item style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                disabled={!challenge.code_sent || remainingSeconds <= 0}
                block
              >
                {t('verification.submit')}
              </Button>
            </Form.Item>
          </Form>
          {remainingSeconds <= 0 && (
            <div style={{ textAlign: 'center', color: 'var(--a-text-tertiary)', fontSize: 13 }}>
              {t('verification.expired')}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <Button
              type="link"
              icon={<ArrowLeftOutlined />}
              onClick={backToLogin}
              disabled={loading || sendLoading}
            >
              {t('verification.back')}
            </Button>
          </div>
        </>
      ) : (
        <Form form={loginForm} onFinish={onLogin} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('username.required') }]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('username.placeholder')} />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: t('password.required') }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('password.placeholder')} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {t('submit')}
            </Button>
          </Form.Item>
        </Form>
      )}
      <div
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: '1px solid var(--a-border-default)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          fontSize: 12,
          color: 'var(--a-text-tertiary)',
        }}
      >
        <a href="mailto:admin@octo.cc" style={{ color: 'var(--a-text-secondary)' }}>
          {t('forgotPassword')}
        </a>
        <span style={{ color: 'var(--a-text-quaternary)' }}>·</span>
        <a href="mailto:admin@octo.cc" style={{ color: 'var(--a-text-secondary)' }}>
          {t('contactAdmin')}
        </a>
      </div>
    </>
  )
}

// 三种状态(探测中 / 表单 / 探测失败)共用同一张卡片外壳，只换卡片内容，
// 避免恢复会话时页面骨架闪一下。
function LoginShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation('login')
  return (
    <div
      className="admin-shell"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--a-bg-canvas)',
      }}
    >
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <LanguageSwitcher />
      </div>
      <Card
        style={{ width: 400 }}
        bordered={false}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            background: 'var(--a-brand)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
            marginBottom: 14,
          }}>
            O
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: 'var(--a-text-primary)', letterSpacing: '-0.01em' }}>Octo</h1>
          <p style={{ color: 'var(--a-text-tertiary)', fontSize: 13 }}>{t('subtitle')}</p>
        </div>
        {children}
      </Card>
      <p
        style={{
          marginTop: 16,
          fontSize: 12,
          color: 'var(--a-text-quaternary)',
          textAlign: 'center',
        }}
      >
        {t('footer', { year: new Date().getFullYear() })}
      </p>
    </div>
  )
}
