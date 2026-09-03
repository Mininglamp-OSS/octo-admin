import type { MySpace } from '../../store/auth'

// 决定进入管理后台后默认落到哪个空间。
// 来源方（如 octo-web「空间管理」入口）通过 ?spaceId= 指定目标，且该 id 确实在
// 用户的可管理列表里时用指定值；否则回退到原有默认（当前空间 / 列表第一个）。
// 成员校验是这里的实际防线：非法 / 已退出 / 越权的 id 一律落不到，且比对的是
// 服务端下发的 id 全等，不存在路径注入或开放重定向的空间。
//
// status 检查是纯防御性冗余，不是「冻结空间的拦截」——后端 /v1/space/my 在 SQL
// 层就只返回 status = 1 的空间，所以正常列表里根本不会出现冻结项，这个分支打不到；
// 列表加载后才被冻结的那种情况，内存里的旧值也还是 1，同样绕过。真正兜底的是
// SpaceAdminLayout 挂载时重新拉 /space/my 并把已不可管理的 id 弹回 /space。
// 保留它只是为了防住「将来某个调用方传进未过滤列表」，不代表冻结态在此被处理。
// status 未定义时视为正常，避免后端偶发缺字段时误伤。
export function resolveTargetSpaceId(
  spaces: Pick<MySpace, 'space_id' | 'status'>[],
  requestedSpaceId: string,
  fallbackSpaceId: string,
): string {
  if (!requestedSpaceId) return fallbackSpaceId
  const match = spaces.find((s) => s.space_id === requestedSpaceId)
  if (!match) return fallbackSpaceId
  if (match.status !== undefined && match.status !== 1) return fallbackSpaceId
  return requestedSpaceId
}
