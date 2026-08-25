import { ApiError } from '../../api'

export type RestoreFailure = 'expired' | 'forbidden' | 'retryable'

/**
 * octo-server 对「管理端角色不够」的错误码。它随 D14 的 wire-pinning 一起出现在
 * 信封里，是这个结论最精确的标识 —— 比状态码更不容易被后续的状态码迁移带偏。
 */
const MANAGER_FORBIDDEN_CODE = 'err.shared.auth.forbidden'

/**
 * 把一次 /v1/manager/me 探测失败分成三类。
 *
 * 两个状态轴回答的是两个不同的问题，必须分开问：
 *
 * - **凭据还有效吗 → 问传输层（`transportStatus`）。** 这是认证层的结论，由
 *   octo-lib 的 AuthMiddleware 给出：token 缺失/无效/过期一律是货真价实的
 *   wire 401，响应体是裸 `{"msg": …}`，连错误信封都没有。清不清本地凭据必须
 *   和 api/index.ts 里的 401 拦截器用同一个判据，否则同一个模块会对同一个
 *   问题给出两种答案。
 *
 * - **授权结论是什么 → 问信封（`status` / `code`）。** 这是应用层的语义结论，
 *   而 octo-server 有一批端点走 `httperr.ResponseErrorL`，为兼容老客户端把
 *   wire 状态钉死在 400（D14），真实状态只放进 `error.http_status`。
 *   /v1/manager/me 的 403 正是其中之一：`respondManagerForbidden` →
 *   `ResponseErrorL(errSharedForbidden)` → wire 400 + 信封 403，
 *   octo-server 的 api_manager_me_test.go 明确钉了这个行为。
 *   所以「是不是被拒绝授权」只能问信封 —— 传输层那里根本没有这个信息。
 *
 * 三种结论的处置：
 *
 * - `expired`：服务端明确表态 token 不再有效，清掉本地凭据、回到登录表单。
 * - `forbidden`：token 有效，只是这个账号不再有管理端权限。清掉它没有意义，
 *   但也不该用「服务器联系不上」的文案糊弄 —— 那是在撒谎，而且没有终态。
 * - `retryable`：服务端根本没表态（网络中断、超时、5xx、网关错误）。此时清
 *   token 是把一次后端抖动升级成「所有管理员被踢下线」，而每个人重新提交
 *   登录表单都会让服务端签发一个新 session（/v1/manager/login 固定 GenerUUID，
 *   从不复用请求里带的 token）。会话数有 per-uid 上限，这样刷很快就顶满，
 *   表现成「登录突然失败」。所以保留 token，让用户重试。
 */
export function classifyRestoreFailure(error: unknown): RestoreFailure {
  if (!(error instanceof ApiError)) return 'retryable'
  if (error.transportStatus === 401) return 'expired'
  if (error.status === 403 || error.code === MANAGER_FORBIDDEN_CODE) return 'forbidden'
  return 'retryable'
}
