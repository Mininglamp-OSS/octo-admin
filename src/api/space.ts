// Copyright 2026 MININGLAMP Technology and the OCTO contributors
// SPDX-License-Identifier: Apache-2.0

import api from './index'

export type SpaceStatus = 0 | 1 | 2
export type SpaceJoinMode = 0 | 1
export type SpaceMemberRole = 0 | 1 | 2
export type JoinApplyStatus = 0 | 1 | 2

export interface Space {
  space_id: string
  name: string
  description: string
  logo: string
  creator: string
  creator_name: string
  status: SpaceStatus
  join_mode: SpaceJoinMode
  max_users: number
  member_count: number
  created_at: string
  updated_at: string
}

export interface SpaceMember {
  uid: string
  name: string
  role: SpaceMemberRole
  status: number
  created_at: string
  updated_at: string
}

export interface SpaceInvite {
  invite_code: string
  space_id: string
  creator: string
  max_uses: number
  used_count: number
  expires_at: string
  status: number
  created_at: string
}

export interface SpaceJoinApply {
  id: number
  space_id: string
  uid: string
  applicant_name: string
  invite_code: string
  remark: string
  status: JoinApplyStatus
  reviewer_uid: string
  created_at: string
}

export interface ListResp<T> {
  count: number
  list: T[]
}

export interface PageParams {
  keyword?: string
  page_index?: number
  page_size?: number
}

const unwrap = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data)

export interface SpaceCreateReq {
  creator_uid: string
  name: string
  description?: string
  logo?: string
  join_mode?: SpaceJoinMode
  max_users?: number
  preset_group_ids?: string | null
}

export interface SpaceCreateResp {
  space_id: string
  creator_uid: string
  name: string
  invite_code?: string
}

export const createSpace = (data: SpaceCreateReq) =>
  unwrap(api.post<SpaceCreateResp>('/v1/manager/spaces', data))

export const listSpaces = (params: PageParams = {}) =>
  unwrap(api.get<ListResp<Space>>('/v1/manager/spaces', { params }))

export const listDisabledSpaces = (params: PageParams = {}) =>
  unwrap(api.get<ListResp<Space>>('/v1/manager/spaces/disabled', { params }))

export const getSpace = (spaceId: string) =>
  unwrap(api.get<Space>(`/v1/manager/spaces/${spaceId}`))

export const dissolveSpace = (spaceId: string) =>
  api.delete(`/v1/manager/spaces/${spaceId}`)

export const updateSpaceStatus = (spaceId: string, status: 1 | 2) =>
  api.put(`/v1/manager/spaces/${spaceId}/status/${status}`)

export interface SpaceMemberListParams extends PageParams {}

export const listSpaceMembers = (spaceId: string, params: SpaceMemberListParams = {}) =>
  unwrap(
    api.get<ListResp<SpaceMember>>(`/v1/manager/spaces/${spaceId}/members`, { params }),
  )

export const addSpaceMembers = (spaceId: string, uids: string[]) =>
  api.post(`/v1/manager/spaces/${spaceId}/members`, { uids })

export const removeSpaceMembers = (spaceId: string, uids: string[]) =>
  api.delete(`/v1/manager/spaces/${spaceId}/members`, { data: { uids } })

export const updateSpaceMemberRole = (
  spaceId: string,
  uid: string,
  role: SpaceMemberRole,
) => api.put(`/v1/manager/spaces/${spaceId}/members/${uid}/role`, { role })

export const listSpaceInvites = (
  spaceId: string,
  params: { page_index?: number; page_size?: number } = {},
) =>
  unwrap(
    api.get<ListResp<SpaceInvite>>(`/v1/manager/spaces/${spaceId}/invites`, { params }),
  )

export const disableSpaceInvite = (spaceId: string, code: string) =>
  api.delete(`/v1/manager/spaces/${spaceId}/invites/${code}`)

export interface SpaceInviteCreateReq {
  max_uses?: number
  expires_at?: string
}

export interface SpaceInviteCreateResp {
  invite_code: string
  space_id: string
  creator: string
  max_uses: number
  expires_at: string
  status: number
}

export const createSpaceInvite = (spaceId: string, data: SpaceInviteCreateReq = {}) =>
  unwrap(
    api.post<SpaceInviteCreateResp>(`/v1/manager/spaces/${spaceId}/invites`, data),
  )

export interface SpaceInviteUpdateReq {
  max_uses?: number
  expires_at?: string
  status?: 0 | 1
}

export const updateSpaceInvite = (
  spaceId: string,
  code: string,
  data: SpaceInviteUpdateReq,
) => api.put(`/v1/manager/spaces/${spaceId}/invites/${code}`, data)

export interface JoinApplyListParams {
  status?: JoinApplyStatus
  page_index?: number
  page_size?: number
}

export const listSpaceJoinApplies = (spaceId: string, params: JoinApplyListParams = {}) =>
  unwrap(
    api.get<ListResp<SpaceJoinApply>>(
      `/v1/manager/spaces/${spaceId}/join-applies`,
      { params },
    ),
  )

export const approveSpaceJoinApply = (spaceId: string, id: number) =>
  api.post(`/v1/manager/spaces/${spaceId}/join-applies/${id}/approve`)

export const rejectSpaceJoinApply = (spaceId: string, id: number) =>
  api.post(`/v1/manager/spaces/${spaceId}/join-applies/${id}/reject`)
