import { ApiError } from '../../api'

export type RestoreFailure = 'expired' | 'forbidden' | 'retryable'

/**
 * 把一次 /v1/manager/me 探测失败分成三类，因为它们的正确处置各不相同。
 *
 * - 401 `expired`：服务端明确表态「这个 token 不再有效」，清掉本地凭据、
 *   回到登录表单。
 * - 403 `forbidden`：token 本身有效，只是这个账号不再有管理端权限。清掉它
 *   没有意义，但也不该用「服务器联系不上」的文案糊弄过去 —— 那是在撒谎，
 *   而且没有终态。它有自己的状态和退出登录入口。
 * - 其余 `retryable`（网络中断、超时、5xx、网关错误）：服务端根本没表态。
 *   此时清 token 是把一次后端抖动升级成「所有管理员被踢下线」，而每个人
 *   重新提交登录表单都会让服务端签发一个新 session（/v1/manager/login 固定
 *   GenerUUID，从不复用请求里带的 token）。会话数有 per-uid 上限，这样刷
 *   很快就会顶满，表现成「登录突然失败」。所以保留 token，让用户重试。
 *
 * 判据取 `transportStatus` 而不是 `status`：后者优先读错误信封里的
 * `error.http_status`，而 octo-server 有一部分端点刻意把 wire 状态钉死在
 * 400、只把真实状态放进信封（见 ApiError 的注释）。「服务端是不是拒绝了这个
 * 凭据」是传输层的问题，必须和 api/index.ts 里 401 拦截器用同一个答案，
 * 否则同一个模块对同一个问题会给出两种回答。
 */
export function classifyRestoreFailure(error: unknown): RestoreFailure {
  const status = error instanceof ApiError ? error.transportStatus : undefined
  if (status === 401) return 'expired'
  if (status === 403) return 'forbidden'
  return 'retryable'
}
