import { ApiError } from '../../api'

export type RestoreFailure = 'expired' | 'retryable'

/**
 * 把一次 /v1/manager/me 探测失败分成两类，因为它们的正确处置正好相反。
 *
 * - 401：服务端明确表态「这个 token 不再有效」，清掉本地凭据、回到登录表单。
 * - 其余（网络中断、超时、5xx、网关错误）：服务端根本没表态。此时清 token
 *   是把一次后端抖动升级成「所有管理员被踢下线」，而每个人重新提交登录表单
 *   都会让服务端签发一个新 session（/v1/manager/login 固定 GenerUUID，从不
 *   复用请求里带的 token）。会话数有 per-uid 上限，这样刷很快就会顶满，
 *   表现成「登录突然失败」。所以这里保留 token，让用户重试。
 *
 * 403 归入 retryable：token 本身是有效的，只是权限不够，清掉它没有意义。
 */
export function classifyRestoreFailure(error: unknown): RestoreFailure {
  const status = error instanceof ApiError ? error.status : undefined
  return status === 401 ? 'expired' : 'retryable'
}
