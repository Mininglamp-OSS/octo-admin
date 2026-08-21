import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Spin, Result, Button, Form, Input, Card, Alert, Typography } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useAuthStore } from '../../store/auth'
import { getMySpaces, getUser } from '../../api/space-user'
import { userLogin } from '../../api/auth'
import type { MySpace } from '../../store/auth'
import { useState } from 'react'

function readFromSession(prefix: string): string {
  if (typeof sessionStorage === 'undefined') return ''
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (!key) continue
    if (key === prefix || key.startsWith(prefix)) {
      const v = sessionStorage.getItem(key)
      if (v) return v
    }
  }
  return ''
}

function readSessionToken(): string {
  return readFromSession('token')
}

function readSessionUid(): string {
  return readFromSession('uid')
}

function decodeJwtUid(token: string): string {
  const parts = token.split('.')
  if (parts.length !== 3) return ''
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as Record<string, unknown>
    const candidate = payload.uid ?? payload.user_id ?? payload.sub
    return typeof candidate === 'string' ? candidate : ''
  } catch {
    return ''
  }
}

export default function SpaceEntry() {
  const { t } = useTranslation('spaceAdmin')
  const navigate = useNavigate()
  const loginSpace = useAuthStore((s) => s.loginSpace)
  const [status, setStatus] = useState<'loading' | 'form' | 'no-space' | 'error'>('loading')
  // 'super'：当前浏览器里是超管会话。超管与空间管理员是两套身份，继续即以空间账号登录。
  const [cameFromSuper, setCameFromSuper] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const onceRef = useRef(false)

  useEffect(() => {
    if (onceRef.current) return
    onceRef.current = true
    const state = useAuthStore.getState()
    if (state.isLoggedIn && state.scope === 'super') {
      // 旧行为是把超管静默弹回超管首页：用户点进空间控制台，却在毫无解释的情况下
      // 回到了原地。改为显式提示 + 登录表单，由用户决定是否切换身份。
      setCameFromSuper(true)
      setStatus('form')
      return
    }
    if (state.isLoggedIn && state.scope === 'space' && state.mySpaces.length > 0) {
      if (!state.name) {
        const uid =
          state.uid ||
          readSessionUid() ||
          state.mySpaces.find((s) => s.role === 2)?.creator ||
          decodeJwtUid(state.token)
        if (uid) {
          getUser(uid)
            .then((u) => {
              useAuthStore.setState({
                uid: u.uid || uid,
                name: u.name || u.username || '',
              })
            })
            .catch(() => {})
        }
      }
      navigate(`/space/${state.currentSpaceId || state.mySpaces[0].space_id}/members`, {
        replace: true,
      })
      return
    }
    const token = readSessionToken()
    if (!token) {
      // 同标签页没有 IM 会话（例如直接打开 /admin/space）。以前这里是死路一条，
      // 现在给空间控制台自己的登录入口。
      setStatus('form')
      return
    }
    useAuthStore.setState({
      scope: 'space',
      token,
      isLoggedIn: true,
      name: '',
      uid: '',
    })
    enterWithToken(token, readSessionUid())
      .catch((error: Error) => {
        useAuthStore.getState().logout()
        setErrorMsg(error.message)
        setStatus('error')
      })
    // enterWithToken 在组件内定义，依赖恒定，无需进依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginSpace, navigate])

  // 拿到用户 token 之后的共同落地流程：确认有可管理的空间 → 补用户名 → 进控制台。
  async function enterWithToken(token: string, knownUid: string) {
    useAuthStore.setState({ scope: 'space', token, isLoggedIn: true, name: '', uid: '' })
    const list = await getMySpaces()
    const managed: MySpace[] = (list || []).filter((s) => s.role >= 1)
    if (managed.length === 0) {
      useAuthStore.getState().logout()
      setStatus('no-space')
      return
    }
    const uid = knownUid || managed.find((s) => s.role === 2)?.creator || decodeJwtUid(token)
    let name = ''
    let resolvedUid = uid
    if (uid) {
      try {
        const u = await getUser(uid)
        name = u.name || u.username || ''
        resolvedUid = u.uid || uid
      } catch {
        // 静默降级:名字拿不到就用兜底
      }
    }
    loginSpace(token, resolvedUid, name, managed)
    navigate(`/space/${managed[0].space_id}/members`, { replace: true })
  }

  async function handleLogin(values: { username: string; password: string }) {
    setSubmitting(true)
    setFormError('')
    try {
      const res = await userLogin(values)
      if (!res.token) throw new Error(t('entry.login.noToken'))
      await enterWithToken(res.token, res.uid || '')
    } catch (error) {
      useAuthStore.getState().logout()
      setFormError(error instanceof Error ? error.message : String(error))
      setStatus('form')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div
        className="admin-shell"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spin size="large" tip={t('entry.loading')} />
      </div>
    )
  }

  if (status === 'form') {
    return (
      <div
        className="admin-shell"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <Card style={{ width: 380 }}>
          <Typography.Title level={4} style={{ marginTop: 0 }}>
            {t('entry.login.title')}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            {t('entry.login.subtitle')}
          </Typography.Paragraph>
          {cameFromSuper && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={t('entry.login.superNotice')}
            />
          )}
          {formError && (
            <Alert type="error" showIcon style={{ marginBottom: 16 }} message={formError} />
          )}
          <Form layout="vertical" onFinish={handleLogin} disabled={submitting}>
            <Form.Item
              name="username"
              rules={[{ required: true, message: t('entry.login.usernameRequired') }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder={t('entry.login.username')}
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: t('entry.login.passwordRequired') }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={t('entry.login.password')}
                autoComplete="current-password"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              {t('entry.login.submit')}
            </Button>
          </Form>
          <Button type="link" block style={{ marginTop: 8 }} onClick={() => navigate('/login')}>
            {t('entry.login.toSuper')}
          </Button>
        </Card>
      </div>
    )
  }

  if (status === 'no-space') {
    return (
      <Result
        status="info"
        title={t('entry.noSpace.title')}
        subTitle={t('entry.noSpace.subtitle')}
        extra={
          <Button onClick={() => navigate('/login')}>{t('entry.noSpace.action')}</Button>
        }
      />
    )
  }

  return (
    <Result
      status="error"
      title={t('entry.error.title')}
      subTitle={errorMsg}
      extra={
        <Button type="primary" onClick={() => window.location.reload()}>
          {t('entry.error.action')}
        </Button>
      }
    />
  )
}
