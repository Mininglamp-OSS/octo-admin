export const MANAGER_CAPABILITY_KEYS = [
  'system_setting',
  'backup',
  'appversion.read',
  'appversion.write',
  'dashboard.read',
  'dashboard.trigger',
  'users.read',
  'users.write',
  // Reserved for administrator-account management UI when that surface is added.
  'users.manage_admin',
  'groups.read',
  'groups.write',
  'space.read',
  'space.write',
  'space.destructive',
  // System MCP catalog admin surface. Read = list; write = create / edit /
  // delete platform-provided (visibility=system) MCP records against
  // octo-marketplace's /admin/api/v1/mcps.
  'mcp.read',
  'mcp.write',
] as const

export const MANAGER_NO_ACCESS_PATH = '/no-access'

export type ManagerCapabilityKey = (typeof MANAGER_CAPABILITY_KEYS)[number]

export type ManagerCapabilities = Record<ManagerCapabilityKey, boolean>

export interface ManagerMe {
  uid: string
  name: string
  role: string
  capabilities: ManagerCapabilities
}

export function normalizeManagerCapabilities(
  capabilities?: Partial<Record<ManagerCapabilityKey, unknown>> | null,
): ManagerCapabilities {
  return MANAGER_CAPABILITY_KEYS.reduce((acc, key) => {
    acc[key] = capabilities?.[key] === true
    return acc
  }, {} as ManagerCapabilities)
}

export function hasManagerCapability(
  capabilities: ManagerCapabilities | null | undefined,
  key: ManagerCapabilityKey,
): boolean {
  return capabilities?.[key] === true
}

export function firstManagerPath(capabilities: ManagerCapabilities | null | undefined): string {
  if (hasManagerCapability(capabilities, 'dashboard.read')) return '/dashboard'
  if (hasManagerCapability(capabilities, 'users.read')) return '/users'
  if (hasManagerCapability(capabilities, 'groups.read')) return '/groups'
  if (hasManagerCapability(capabilities, 'space.read')) return '/spaces'
  if (hasManagerCapability(capabilities, 'system_setting')) return '/system-setting'
  if (hasManagerCapability(capabilities, 'backup')) return '/backup'
  if (hasManagerCapability(capabilities, 'appversion.read')) return '/download'
  if (hasManagerCapability(capabilities, 'mcp.read')) return '/system-mcp'
  return MANAGER_NO_ACCESS_PATH
}
