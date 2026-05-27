import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { login } from '../../api/auth'
import { useAuthStore } from '../../store/auth'

interface LoginForm {
  username: string
  password: string
}

export default function Login() {
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
