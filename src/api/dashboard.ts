import api from './index'

export type DashboardActiveStatus = 'all' | 'active' | 'inactive'
export type DashboardOrder = 'asc' | 'desc'
export type DashboardTrendGranularity = 'day' | 'week'
export type DashboardSpaceSortBy =
  | 'last_active'
  | 'human_msg_count'
  | 'agent_msg_count'
  | 'total_msg'
  | 'group_total'
  | 'human_member_total'
export type DashboardChannelSortBy =
  | 'last_active'
  | 'human_msg_count'
  | 'agent_msg_count'
  | 'total_msg'
  | 'member_count'
export type DashboardDirectChatSortBy = 'last_active' | 'msg_count'

export interface DashboardDateParams {
  start_date?: string
  end_date?: string
}

export interface DashboardOverviewParams extends DashboardDateParams {
  space_ids?: string[]
}

export interface DashboardTrendParams extends DashboardOverviewParams {
  granularity?: DashboardTrendGranularity
}

export interface DashboardPageParams extends DashboardDateParams {
  page_index?: number
  page_size?: number
  order?: DashboardOrder
}

export interface DashboardSpaceListParams extends DashboardPageParams {
  name?: string
  active_status?: DashboardActiveStatus
  sort_by?: DashboardSpaceSortBy
}

export interface DashboardChannelListParams extends DashboardPageParams {
  active_status?: DashboardActiveStatus
  sort_by?: DashboardChannelSortBy
}

export interface DashboardDirectChatListParams extends DashboardPageParams {
  sort_by?: DashboardDirectChatSortBy
}

export interface DashboardOverview {
  space_total: number
  group_total: number
  human_member_total: number
  agent_total: number
  active_groups: number
  active_human_members: number
  active_agent_members: number
  human_msg_count: number
  agent_msg_count: number
  private_active_count: number
  message_composition?: DashboardMessageCompositionItem[]
}

export interface DashboardMessageCompositionItem {
  conv_type: number
  human_msg_count: number
  agent_msg_count: number
  total_msg_count: number
  active_channel_count: number
}

export interface DashboardTrendResp {
  granularity: DashboardTrendGranularity
  list: DashboardTrendItem[]
}

export interface DashboardTrendItem {
  bucket: string
  start_date: string
  end_date: string
  human_msg_count: number
  agent_msg_count: number
  total_msg_count: number
  active_human_members: number
  active_agent_members: number
  active_groups: number
  private_active_count: number
  conv_type_msg_counts: DashboardTrendConvTypeMsgItem[]
}

export interface DashboardTrendConvTypeMsgItem {
  conv_type: number
  human_msg_count: number
  agent_msg_count: number
  total_msg_count: number
}

export interface DashboardSpaceItem {
  space_id: string
  name: string
  group_total: number
  human_member_total: number
  agent_total: number
  human_msg_count: number
  agent_msg_count: number
  last_active: number
  is_active: boolean
}

export interface DashboardChannelItem {
  channel_id: string
  name: string
  conv_type: number
  member_count: number
  human_member_count: number
  agent_member_count: number
  human_msg_count: number
  agent_msg_count: number
  last_active_at: number
  status: number
  is_active: boolean
}

export interface DashboardDirectChatItem {
  channel_id: string
  member_a_uid: string
  member_a_name: string
  member_b_uid: string
  member_b_name: string
  conv_type: number
  msg_count: number
  last_active: number
}

export interface DashboardListResp<T> {
  count: number
  list: T[]
}

export interface DashboardEtlRunResp {
  status: number
  state: string
}

export function buildDashboardSearchParams(
  params:
    | DashboardOverviewParams
    | DashboardTrendParams
    | DashboardSpaceListParams
    | DashboardChannelListParams
    | DashboardDirectChatListParams,
) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (key === 'space_ids' && Array.isArray(value)) {
      value.forEach((spaceId) => {
        if (spaceId) searchParams.append('space_ids', spaceId)
      })
      return
    }
    searchParams.set(key, String(value))
  })

  return searchParams
}

const unwrap = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data)

export const getDashboardOverview = (params: DashboardOverviewParams = {}) =>
  unwrap(
    api.get<DashboardOverview>('/v1/manager/dashboard/overview', {
      params: buildDashboardSearchParams(params),
    }),
  )

export const getDashboardTrend = (params: DashboardTrendParams = {}) =>
  unwrap(
    api.get<DashboardTrendResp>('/v1/manager/dashboard/trend', {
      params: buildDashboardSearchParams(params),
    }),
  )

export const listDashboardSpaces = (params: DashboardSpaceListParams = {}) =>
  unwrap(
    api.get<DashboardListResp<DashboardSpaceItem>>('/v1/manager/dashboard/spaces', {
      params: buildDashboardSearchParams(params),
    }),
  )

export const listDashboardChannels = (
  spaceId: string,
  params: DashboardChannelListParams = {},
) =>
  unwrap(
    api.get<DashboardListResp<DashboardChannelItem>>(
      `/v1/manager/dashboard/spaces/${spaceId}/channels`,
      { params: buildDashboardSearchParams(params) },
    ),
  )

export const listDashboardDirectChats = (params: DashboardDirectChatListParams = {}) =>
  unwrap(
    api.get<DashboardListResp<DashboardDirectChatItem>>(
      '/v1/manager/dashboard/global/direct-chats',
      { params: buildDashboardSearchParams(params) },
    ),
  )

export const runDashboardEtl = () =>
  unwrap(api.post<DashboardEtlRunResp>('/v1/manager/dashboard/etl/run'))
