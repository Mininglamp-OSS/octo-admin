import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Spin, Result, Button } from 'antd'
import { useAuthStore } from '../../store/auth'
import { getMySpaces, getUser } from '../../api/space-user'
import type { MySpace } from '../../store/auth'
import { useState } from 'react'
import { resolveTargetSpaceId } from './spaceTarget'

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

// 从 URL query 读取来源方（如 octo-web「空间管理」入口）指定的目标空间 id。
// 用户在主站可能同时管理多个空间，带上当前空间 id 后就默认落到该空间，
// 而不是可管理列表里的第一个。取不到时返回空串，走原有默认逻辑。
function readRequestedSpaceId(): string {
  if (typeof window === 'undefined') return ''
  try {
    return new URLSearchParams(window.location.search).get('spaceId') || ''
  } catch {
    return ''
  }
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
    const requestedSpaceId = readRequestedSpaceId()
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
      const fallbackSpaceId = state.currentSpaceId || state.mySpaces[0].space_id
      const targetSpaceId = resolveTargetSpaceId(
        state.mySpaces,
        requestedSpaceId,
        fallbackSpaceId,
      )
      navigate(`/space/${targetSpaceId}/members`, {
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
        const targetSpaceId = resolveTargetSpaceId(
          managed,
          requestedSpaceId,
          managed[0].space_id,
        )
        // loginSpace 内部把 currentSpaceId 设为 managed[0]，若解析结果不同会导致
        // SpaceSwitcher 短暂选中错误项（等 SpaceAdminLayout effect 再纠正）。
        // 这里在 navigate 前先把 store 对齐到实际要打开的空间。
        if (targetSpaceId !== managed[0].space_id) {
          useAuthStore.getState().setCurrentSpaceId(targetSpaceId)
        }
        navigate(`/space/${targetSpaceId}/members`, { replace: true })
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
