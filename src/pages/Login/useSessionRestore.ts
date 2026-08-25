import { useCallback, useEffect, useRef, useState } from 'react'
import { getManagerMe } from '../../api/auth'
import { firstManagerPath } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'
import { classifyRestoreFailure } from './sessionRestore'

export type SessionRestoreStatus = 'checking' | 'form' | 'error'

export interface SessionRestoreState {
  status: SessionRestoreStatus
  errorMessage: string
  retry: () => void
  dismiss: () => void
}

/**
 * 进入登录页时，先拿已持久化的 manager token 探一次 /v1/manager/me，
 * 会话还有效就直接进后台，不再提交登录表单。
 *
 * 这样做的原因在服务端：/v1/manager/login 认证通过后无条件 GenerUUID 并
 * issueUserSession，从不复用请求头里带的 token。所以「本地明明有有效 token
 * 却又走一遍表单登录」每次都会凭空多出一个服务端 session，而 session 有
 * per-uid 上限，攒满之后登录会直接失败。
 */
export function useSessionRestore(onRestored: (path: string) => void): SessionRestoreState {
  // 只认挂载那一刻的持久化凭据。登录成功后 store 里的 token 会变，
  // 若跟着它走会把探测再触发一遍。
  //
  // isLoggedIn 必须一起判：恢复成功走的是 setManagerMe，它不设 isLoggedIn。
  // 若持久化状态里 token 非空而 isLoggedIn 为 false，探测会成功 → 跳
  // /dashboard → SuperOnlyRoute 打回 /login → 再探测，成为死循环。
  const [restorable] = useState(() => {
    const { token, scope, isLoggedIn } = useAuthStore.getState()
    return isLoggedIn && scope === 'super' && token !== ''
  })
  const [status, setStatus] = useState<SessionRestoreStatus>(restorable ? 'checking' : 'form')
  const [errorMessage, setErrorMessage] = useState('')
  const onRestoredRef = useRef(onRestored)
  // 兼顾 StrictMode 的双次 effect 与用户在探测途中连点重试。
  const probing = useRef(false)

  // 在 effect 里同步而不是渲染期赋值：并发渲染下被丢弃的那次渲染
  // 不应该改到 ref。首次探测用的是 useRef 的初始值，本来就是对的。
  useEffect(() => {
    onRestoredRef.current = onRestored
  }, [onRestored])

  const probe = useCallback(async () => {
    if (probing.current) return
    probing.current = true
    setStatus('checking')
    setErrorMessage('')
    try {
      // skipAuthRedirect：401 由这里处置，不走全局的清凭据 + 硬跳转。
      const profile = await getManagerMe({ skipAuthRedirect: true })
      useAuthStore.getState().setManagerMe(profile)
      onRestoredRef.current(firstManagerPath(profile.capabilities))
    } catch (error) {
      if (classifyRestoreFailure(error) === 'expired') {
        useAuthStore.getState().logout()
        setStatus('form')
      } else {
        setErrorMessage(error instanceof Error ? error.message : '')
        setStatus('error')
      }
    } finally {
      probing.current = false
    }
  }, [])

  useEffect(() => {
    if (!restorable) return
    void probe()
  }, [probe, restorable])

  const retry = useCallback(() => {
    void probe()
  }, [probe])

  const dismiss = useCallback(() => {
    setErrorMessage('')
    setStatus('form')
  }, [])

  return { status, errorMessage, retry, dismiss }
}
