import { useCallback, useEffect, useRef, useState } from 'react'
import { getManagerMe } from '../../api/auth'
import { firstManagerPath } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'
import { classifyRestoreFailure } from './sessionRestore'

export type SessionRestoreStatus = 'checking' | 'form' | 'error' | 'forbidden'

export interface SessionRestoreState {
  status: SessionRestoreStatus
  /** 原始的后端/传输层文案，只作为本地化文案下面的一行细节。 */
  errorDetail: string
  retry: () => void
  /** 放弃恢复，改用账号密码表单。保留凭据。 */
  dismiss: () => void
  /** 权限被收回时的终态出口：清掉凭据回到表单。 */
  signOut: () => void
}

/**
 * 探测用的超时，刻意比实例默认的 30s 短得多。
 *
 * 恢复会话是一个延迟优化 —— 它省掉的是一次本来就能用的登录表单。所以后端
 * 慢的时候它必须快速失败：让运维盯着转圈等 30 秒，比直接给他表单更糟。
 */
const PROBE_TIMEOUT_MS = 8000

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
  const [errorDetail, setErrorDetail] = useState('')
  const onRestoredRef = useRef(onRestored)
  // 兼顾 StrictMode 的双次 effect 与用户在探测途中连点重试。
  const probing = useRef(false)
  // 世代号：用户放弃当前探测后，迟到的响应必须变成哑弹。
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  // 组件是否还挂着。见下面 effect 里的说明 —— 它让「卸载后不落地」成为结构性
  // 保证，而不是依赖调用方每次都记得先 logout()。
  const mounted = useRef(true)

  // 在 effect 里同步而不是渲染期赋值：并发渲染下被丢弃的那次渲染
  // 不应该改到 ref。首次探测用的是 useRef 的初始值，本来就是对的。
  useEffect(() => {
    onRestoredRef.current = onRestored
  }, [onRestored])

  const probe = useCallback(async () => {
    if (probing.current) return
    probing.current = true
    const run = generation.current
    const aborter = new AbortController()
    controller.current = aborter
    setStatus('checking')
    setErrorDetail('')

    let restoredPath: string | null = null
    try {
      // skipAuthRedirect：401 由这里处置，不走全局的清凭据 + 硬跳转。
      const profile = await getManagerMe({
        skipAuthRedirect: true,
        timeoutMs: PROBE_TIMEOUT_MS,
        signal: aborter.signal,
      })
      if (run !== generation.current || !mounted.current) return
      useAuthStore.getState().setManagerMe(profile)
      restoredPath = firstManagerPath(profile.capabilities)
    } catch (error) {
      if (run !== generation.current || !mounted.current) return
      const failure = classifyRestoreFailure(error)
      if (failure === 'expired') {
        useAuthStore.getState().logout()
        setStatus('form')
      } else if (failure === 'forbidden') {
        setStatus('forbidden')
      } else {
        setErrorDetail(error instanceof Error ? error.message : '')
        setStatus('error')
      }
    } finally {
      if (run === generation.current) {
        probing.current = false
        controller.current = null
      }
    }

    // 导航回调放在 try/catch 之外：它抛出的异常不该被归到探测失败上，
    // 否则一个已经验证通过、能力图谱都写好了的会话会显示「无法验证登录状态」。
    //
    // 代价是这种异常会变成一个 unhandled rejection 而不是被 hook 吞掉 ——
    // 这是有意的：navigate() 抛错是调用方的 bug，应该响亮地暴露，而不是
    // 被伪装成一次探测失败。
    if (restoredPath !== null) onRestoredRef.current(restoredPath)
  }, [])

  // 作废当前探测：换掉世代号并真的中止请求。用户点了「改用账号密码登录」
  // 开始打字之后，一个迟到的成功响应不能再把他带走。
  const abandon = useCallback(() => {
    generation.current += 1
    controller.current?.abort()
    controller.current = null
    probing.current = false
  }, [])

  useEffect(() => {
    mounted.current = true
    if (!restorable) return
    void probe()
    // 卸载时只翻标志位，不 abort。
    //
    // abort 会被 StrictMode 的 mount → unmount → remount 误伤：第一次探测被
    // 掐断，第二次 effect 又因为 probing.current 仍为 true 而直接返回，结果是
    // 一次都探不成。翻标志位则安全 —— StrictMode 的第二次 effect 会把它设回
    // true，真正的卸载不会。单次探测这个已验证的性质得以保住。
    //
    // 这样「卸载之后不再写 store、不再导航」就是结构性保证，不再依赖「离开
    // /login 的每条路径都记得先 logout()」这个跨四个文件的巧合。
    return () => {
      mounted.current = false
    }
  }, [probe, restorable])

  const retry = useCallback(() => {
    void probe()
  }, [probe])

  const dismiss = useCallback(() => {
    abandon()
    setErrorDetail('')
    setStatus('form')
  }, [abandon])

  const signOut = useCallback(() => {
    abandon()
    useAuthStore.getState().logout()
    setErrorDetail('')
    setStatus('form')
  }, [abandon])

  return { status, errorDetail, retry, dismiss, signOut }
}
