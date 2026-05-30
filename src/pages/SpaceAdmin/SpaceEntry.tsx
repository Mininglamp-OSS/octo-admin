import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Spin, Result, Button } from 'antd'
import { useAuthStore } from '../../store/auth'
import { getMySpaces, getUser } from '../../api/space-user'
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
  const [status, setStatus] = useState<'loading' | 'no-token' | 'no-space' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const onceRef = useRef(false)

  useEffect(() => {
    if (onceRef.current) return
    onceRef.current = true
    const state = useAuthStore.getState()
    if (state.isLoggedIn && state.scope === 'super') {
      navigate('/dashboard', { replace: true })
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
      setStatus('no-token')
      return
    }
    useAuthStore.setState({
      scope: 'space',
      token,
      isLoggedIn: true,
      name: '',
      uid: '',
    })
    getMySpaces()
      .then(async (list) => {
        const managed: MySpace[] = (list || []).filter((s) => s.role >= 1)
        if (managed.length === 0) {
          useAuthStore.getState().logout()
          setStatus('no-space')
          return
        }
        const uid =
          readSessionUid() ||
          managed.find((s) => s.role === 2)?.creator ||
          decodeJwtUid(token)
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
      })
      .catch((error: Error) => {
        useAuthStore.getState().logout()
        setErrorMsg(error.message)
        setStatus('error')
      })
  }, [loginSpace, navigate])

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

  if (status === 'no-token') {
    return (
      <Result
        status="warning"
        title={t('entry.noToken.title')}
        subTitle={t('entry.noToken.subtitle')}
        extra={
          <Button type="primary" onClick={() => navigate('/login')}>
            {t('entry.noToken.action')}
          </Button>
        }
      />
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
