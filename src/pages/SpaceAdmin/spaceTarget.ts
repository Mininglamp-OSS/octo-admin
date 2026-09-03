import type { MySpace } from '../../store/auth'

// 决定进入管理后台后默认落到哪个空间。
// 来源方（如 octo-web「空间管理」入口）通过 ?spaceId= 指定目标，且用户确实
// 可管理该空间时用指定值；否则回退到原有默认（当前空间 / 可管理列表第一个）。
// 抽成纯函数便于单测，也避免非法 / 已退出的 spaceId 把用户带到无权限页面。
export function resolveTargetSpaceId(
  spaces: Pick<MySpace, 'space_id'>[],
  requestedSpaceId: string,
  fallbackSpaceId: string,
): string {
  if (requestedSpaceId && spaces.some((s) => s.space_id === requestedSpaceId)) {
    return requestedSpaceId
  }
  return fallbackSpaceId
}
