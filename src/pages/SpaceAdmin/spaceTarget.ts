import type { MySpace } from '../../store/auth'

// 决定进入管理后台后默认落到哪个空间。
// 来源方（如 octo-web「空间管理」入口）通过 ?spaceId= 指定目标，且用户确实
// 可管理该空间时用指定值；否则回退到原有默认（当前空间 / 可管理列表第一个）。
// 抽成纯函数便于单测，也避免非法 / 已退出 / 已冻结的 spaceId 把用户带到问题页面。
//
// 状态判定与 SpaceAdminLayout 中 `detail.status === 1` 表示"正常"保持一致；
// status 未定义时视为正常（后端偶发缺字段时不误伤，回退给上游的 loading 场景）。
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
