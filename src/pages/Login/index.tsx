import { useCallback, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Spin, Alert, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { login } from '../../api/auth'
import { useAuthStore } from '../../store/auth'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { useSessionRestore } from './useSessionRestore'

export default function Login() {
  const navigate = useNavigate()
  const { status, errorMessage, retry, dismiss } = useSessionRestore(
    useCallback((path: string) => navigate(path, { replace: true }), [navigate]),
  )

  return (
    <LoginShell>
      {status === 'checking' && <RestoringBody />}
      {status === 'error' && (
        <RestoreErrorBody message={errorMessage} onRetry={retry} onDismiss={dismiss} />
      )}
      {status === 'form' && <CredentialsForm />}
    </LoginShell>
  )
}

function RestoringBody() {
  const { t } = useTranslation('login')
  return (
    <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: '24px 0' }}>
      {/* antd 的 Spin 根节点自带 aria-live="polite"，套在外层 status 里就成了
          嵌套 live region。转圈只是装饰，要播报的是下面那行文案。 */}
      <span aria-hidden="true">
        <Spin />
      </span>
      <p style={{ marginTop: 16, marginBottom: 0, color: 'var(--a-text-tertiary)', fontSize: 13 }}>
        {t('restore.checking')}
      </p>
    </div>
  )
}

interface RestoreErrorBodyProps {
  message: string
  onRetry: () => void
  onDismiss: () => void
}

function RestoreErrorBody({ message, onRetry, onDismiss }: RestoreErrorBodyProps) {
  const { t } = useTranslation('login')
  // antd 的 Alert 根节点已经是 role="alert"，不再外包一层，否则读屏会拿到
  // 两个嵌套的 alert 区域；两个恢复按钮也不该被卷进 live region 里播报。
  return (
    <>
      <Alert
        type="warning"
        showIcon
        message={t('restore.error.title')}
        description={message || t('restore.error.description')}
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

interface LoginForm {
  username: string
  password: string
}

function CredentialsForm() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const authLogin = useAuthStore((state) => state.loginSuper)
  const { t } = useTranslation('login')

  const onFinish = async (values: LoginForm) => {
    setLoading(true)
    try {
      const data = await login(values)
      authLogin(data.token, data.name, data.role)
      message.success(t('success'))
      navigate('/dashboard')
    } catch (error) {
      message.error((error as Error).message || t('failure'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Form onFinish={onFinish} size="large">
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
