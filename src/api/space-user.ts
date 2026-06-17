import api from './index'
import type { MySpace } from '../store/auth'

export interface SpaceUserDetail {
  space_id: string
  name: string
  description?: string
  logo?: string
  creator: string
  status: number
  role: 0 | 1 | 2
  max_users: number
  member_count: number
  join_mode: number
  created_at?: string
  updated_at?: string
}

export interface SpaceUserMember {
  uid: string
  name: string
  role: 0 | 1 | 2
  robot: 0 | 1
  created_at?: string
}

export interface SpaceUserInvite {
  invite_code: string
  space_id: string
  creator: string
  max_uses: number
  used_count: number
  expires_at: string
  status: number
  created_at?: string
}

export interface SpaceUserInviteListResp {
  count: number
  list: SpaceUserInvite[]
}

export interface SpaceUserJoinApply {
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

export interface SpaceUserJoinApplyListResp {
  count: number
  list: SpaceUserJoinApply[]
}

const unwrap = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data)

export const getMySpaces = () => unwrap(api.get<MySpace[]>('/v1/space/my'))

export interface UserInfo {
  uid: string
  name?: string
  username?: string
  avatar?: string
}

export const getUser = (uid: string) => unwrap(api.get<UserInfo>(`/v1/users/${uid}`))

export const getSpaceUserDetail = (spaceId: string) =>
  unwrap(api.get<SpaceUserDetail>(`/v1/space/${spaceId}`))

export interface SpaceUserProfileUpdateReq {
  name?: string
  description?: string
  logo?: string
  join_mode?: 0 | 1
  preset_group_ids?: string
}

export const updateSpaceUserProfile = (
  spaceId: string,
  data: SpaceUserProfileUpdateReq,
) => api.put(`/v1/space/${spaceId}`, data)

export interface SpaceUserMemberSearchItem {
  uid: string
  name: string
  username?: string
  email?: string
  phone?: string
  role: 0 | 1 | 2
  robot: 0 | 1
  created_at?: string
}

export interface SpaceUserMemberSearchResp {
  count: number
  list: SpaceUserMemberSearchItem[]
}

// 空间管理视图的成员分页 / 搜索。后端 GET /v1/space/{id}/members/search 返回带
// 总数的信封({ count, list }),并支持服务端 keyword 模糊匹配(昵称 / 用户名 /
// UID / Email,手机号按后 4 位匹配)。需要空间管理员及以上(role >= 1)——空间
// 管理台入口只对 role >= 1 的空间开放,故此处恒满足权限。旧的 GET /members
// 接口返回裸数组且无总数,无法分页,已弃用。
export const searchSpaceUserMembers = (
  spaceId: string,
  params: { keyword?: string; page_index?: number; page_size?: number } = {},
) =>
  unwrap(
    api.get<SpaceUserMemberSearchResp>(
      `/v1/space/${spaceId}/members/search`,
      { params },
    ),
  )

export const removeSpaceUserMembers = (spaceId: string, uids: string[]) =>
  api.post(`/v1/space/${spaceId}/members/remove`, { uids })

export const updateSpaceUserMemberRole = (
  spaceId: string,
  uid: string,
  role: SpaceUserMember['role'],
) => api.put(`/v1/space/${spaceId}/members/${uid}/role`, { role })

export const createSpaceUserInvite = (
  spaceId: string,
  data: { max_uses?: number; expires_at?: string } = {},
) =>
  unwrap(
    api.post<{ invite_code: string }>(`/v1/space/${spaceId}/invite`, data),
  )

export const updateSpaceUserInvite = (
  spaceId: string,
  code: string,
  data: { max_uses?: number; expires_at?: string; status?: 0 | 1 },
) => api.put(`/v1/space/${spaceId}/invite/${code}`, data)

export const disableSpaceUserInvite = (spaceId: string, code: string) =>
  api.delete(`/v1/space/${spaceId}/invite/${code}`)

export const listSpaceUserInvites = (
  spaceId: string,
  params: { status?: '1' | '0' | 'all'; page_index?: number; page_size?: number } = {},
) =>
  unwrap(
    api.get<SpaceUserInviteListResp>(`/v1/space/${spaceId}/invites`, { params }),
  )

export const listSpaceUserJoinApplies = (
  spaceId: string,
  params: { page?: number; page_size?: number } = {},
) =>
  unwrap(
    api.get<SpaceUserJoinApplyListResp>(
      `/v1/space/${spaceId}/join-applies`,
      { params },
    ),
  )

export const approveSpaceUserJoinApply = (spaceId: string, id: number) =>
  api.post(`/v1/space/${spaceId}/join-applies/${id}/approve`)

export const rejectSpaceUserJoinApply = (spaceId: string, id: number) =>
  api.post(`/v1/space/${spaceId}/join-applies/${id}/reject`)
