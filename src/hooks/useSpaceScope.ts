import { useMemo } from 'react'
import { useAuthStore } from '../store/auth'
import * as manager from '../api/space'
import * as user from '../api/space-user'

export type SpaceScopeKind = 'super' | 'space'
export type SpaceMemberRole = 0 | 1 | 2
export type SpaceScopeRole = 'super' | SpaceMemberRole

export interface InviteListItem {
  invite_code: string
  space_id: string
  creator: string
  max_uses: number
  used_count: number
  expires_at: string
  status: number
  created_at?: string
}

export interface InviteListResp {
  count: number
  list: InviteListItem[]
}

export interface MemberItem {
  uid: string
  name: string
  role: SpaceMemberRole
  status?: number
  robot?: 0 | 1
  created_at?: string
}

export interface MemberListResp {
  count: number
  list: MemberItem[]
}

export interface JoinApplyItem {
  id: number
  space_id: string
  uid: string
  applicant_name: string
  invite_code?: string
  remark?: string
  status: 0 | 1 | 2
  reviewer_uid?: string
  created_at?: string
}

export interface JoinApplyListResp {
  count: number
  list: JoinApplyItem[]
}

export interface ScopedMemberParams {
  page_index?: number
  page_size?: number
  keyword?: string
}

export interface ScopedInviteParams {
  page_index?: number
  page_size?: number
  status?: '1' | '0' | 'all'
}

export interface ScopedJoinApplyParams {
  page_index?: number
  page_size?: number
  status?: 0 | 1 | 2
}

export interface SpaceScope {
  kind: SpaceScopeKind
  role: SpaceScopeRole
  canManageInvites: boolean
  canRemoveMembers: boolean
  canAddMembers: boolean
  canReviewApplies: boolean
  supportsMemberSearch: boolean
  supportsMemberPagination: boolean
  supportsApplyFilter: boolean
  api: {
    listMembers: (spaceId: string, params: ScopedMemberParams) => Promise<MemberListResp>
    addMembers?: (spaceId: string, uids: string[]) => Promise<unknown>
    removeMembers: (spaceId: string, uids: string[]) => Promise<unknown>
    updateMemberRole: (spaceId: string, uid: string, role: SpaceMemberRole) => Promise<unknown>
    listInvites: (spaceId: string, params: ScopedInviteParams) => Promise<InviteListResp>
    createInvite: (
      spaceId: string,
      data: { max_uses?: number; expires_at?: string },
    ) => Promise<{ invite_code: string }>
    updateInvite: (
      spaceId: string,
      code: string,
      data: { max_uses?: number; expires_at?: string; status?: 0 | 1 },
    ) => Promise<unknown>
    disableInvite: (spaceId: string, code: string) => Promise<unknown>
    listJoinApplies: (
      spaceId: string,
      params: ScopedJoinApplyParams,
    ) => Promise<JoinApplyListResp>
    approveJoinApply: (spaceId: string, id: number) => Promise<unknown>
    rejectJoinApply: (spaceId: string, id: number) => Promise<unknown>
  }
}

function buildSuperScope(): SpaceScope {
  return {
    kind: 'super',
    role: 'super',
    canManageInvites: true,
    canRemoveMembers: true,
    canAddMembers: true,
    canReviewApplies: true,
    supportsMemberSearch: true,
    supportsMemberPagination: true,
    supportsApplyFilter: true,
    api: {
      listMembers: async (spaceId, params) => {
        const res = await manager.listSpaceMembers(spaceId, params)
        return { count: res.count, list: res.list as MemberItem[] }
      },
      addMembers: (spaceId, uids) => manager.addSpaceMembers(spaceId, uids),
      removeMembers: (spaceId, uids) => manager.removeSpaceMembers(spaceId, uids),
      updateMemberRole: (spaceId, uid, role) =>
        manager.updateSpaceMemberRole(spaceId, uid, role),
      listInvites: async (spaceId, params) => {
        const res = await manager.listSpaceInvites(spaceId, {
          page_index: params.page_index,
          page_size: params.page_size,
        })
        const filtered =
          !params.status || params.status === 'all'
            ? res.list
            : params.status === '1'
              ? res.list.filter((x) => x.status === 1)
              : res.list.filter((x) => x.status === 0)
        return { count: res.count, list: filtered as InviteListItem[] }
      },
      createInvite: async (spaceId, data) => {
        const resp = await manager.createSpaceInvite(spaceId, data)
        return { invite_code: resp.invite_code }
      },
      updateInvite: (spaceId, code, data) =>
        manager.updateSpaceInvite(spaceId, code, data),
      disableInvite: (spaceId, code) => manager.disableSpaceInvite(spaceId, code),
      listJoinApplies: async (spaceId, params) => {
        const res = await manager.listSpaceJoinApplies(spaceId, params)
        return { count: res.count, list: res.list as JoinApplyItem[] }
      },
      approveJoinApply: (spaceId, id) => manager.approveSpaceJoinApply(spaceId, id),
      rejectJoinApply: (spaceId, id) => manager.rejectSpaceJoinApply(spaceId, id),
    },
  }
}

function buildUserScope(role: SpaceMemberRole): SpaceScope {
  const isManager = role >= 1
  return {
    kind: 'space',
    role,
    canManageInvites: isManager,
    canRemoveMembers: isManager,
    canAddMembers: false,
    canReviewApplies: isManager,
    supportsMemberSearch: false,
    supportsMemberPagination: true,
    supportsApplyFilter: false,
    api: {
      listMembers: async (spaceId, params) => {
        const list = await user.listSpaceUserMembers(spaceId, {
          page: params.page_index,
          limit: params.page_size,
        })
        const keyword = params.keyword?.toLowerCase()
        const filtered = keyword
          ? list.filter(
              (m) =>
                m.name?.toLowerCase().includes(keyword) ||
                m.uid?.toLowerCase().includes(keyword),
            )
          : list
        return {
          count: filtered.length,
          list: filtered.map((m) => ({
            uid: m.uid,
            name: m.name,
            role: m.role,
            robot: m.robot,
            status: 1,
            created_at: m.created_at,
          })),
        }
      },
      removeMembers: (spaceId, uids) => user.removeSpaceUserMembers(spaceId, uids),
      updateMemberRole: (spaceId, uid, nextRole) =>
        user.updateSpaceUserMemberRole(spaceId, uid, nextRole),
      listInvites: async (spaceId, params) => {
        const resp = await user.listSpaceUserInvites(spaceId, params)
        return { count: resp.count, list: resp.list }
      },
      createInvite: async (spaceId, data) => {
        const resp = await user.createSpaceUserInvite(spaceId, data)
        const hasCustom =
          data.max_uses !== undefined || (data.expires_at && data.expires_at.length > 0)
        if (hasCustom) {
          try {
            await user.updateSpaceUserInvite(spaceId, resp.invite_code, {
              max_uses: data.max_uses,
              expires_at: data.expires_at,
            })
          } catch (err) {
            throw new Error(
              `邀请码 ${resp.invite_code} 已生成，但自定义参数写入失败：${(err as Error).message}。可在列表里点"编辑"重新设置。`,
            )
          }
        }
        return resp
      },
      updateInvite: (spaceId, code, data) =>
        user.updateSpaceUserInvite(spaceId, code, data),
      disableInvite: (spaceId, code) => user.disableSpaceUserInvite(spaceId, code),
      listJoinApplies: async (spaceId, params) => {
        const resp = await user.listSpaceUserJoinApplies(spaceId, {
          page: params.page_index,
          page_size: params.page_size,
        })
        return { count: resp.count, list: resp.list }
      },
      approveJoinApply: (spaceId, id) => user.approveSpaceUserJoinApply(spaceId, id),
      rejectJoinApply: (spaceId, id) => user.rejectSpaceUserJoinApply(spaceId, id),
    },
  }
}

export function useSpaceScope(role?: SpaceMemberRole): SpaceScope {
  const scope = useAuthStore((s) => s.scope)
  return useMemo(() => {
    if (scope === 'super') return buildSuperScope()
    return buildUserScope(role ?? 0)
  }, [scope, role])
}
