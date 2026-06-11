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

export const listSpaceUserMembers = (
  spaceId: string,
  params: { page?: number; limit?: number } = {},
) =>
  unwrap(
    api.get<SpaceUserMember[]>(`/v1/space/${spaceId}/members`, { params }),
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
