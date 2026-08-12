/**
 * octo-marketplace admin client for Expert (专家) and Squad (专家团) resources.
 *
 * Uses the shared marketplace axios instance from ./marketplace, which handles
 * baseURL, auth token injection, Accept-Language, and error-envelope
 * normalization. Marketplace admits only role=superAdmin on the /admin/*
 * namespace; this file trusts that gate and only adds resource-specific types
 * + endpoint wrappers. Same pattern as ./mcp.ts and ./skill.ts.
 *
 * Wire contract: marketplace wraps every success payload as `{data: T}` (lists
 * add `pagination`) and every field is snake_case. Types here mirror the wire
 * exactly — page code reads snake_case directly.
 *
 * Creation model (see plan async-honking-yao): the admin never uploads the
 * container zip. The browser unzips it (parseContainer.ts), presigns + PUTs
 * each bundled skill package via `uploadExpertSkill`, then submits a flat JSON
 * manifest to create/patch. Mirrors octo-cli `marketplace expert create`.
 */

import { marketplaceApi as expertApi, putPresignedFile } from './marketplace'

// ─── Shared types (mirror octo-marketplace internal/model/expert_dto.go) ───

export type ExpertKind = 'agent' | 'squad'
export type ExpertVisibility = 'public' | 'private' | 'system'

/** Read projection of a skill on an expert/squad (never echoes bytes). */
export interface SkillRef {
  name: string
  has_content?: boolean
  can_download?: boolean
  file_name?: string
  file_size?: number
  files?: string[]
}

/** Write shape referenced in create/patch `skills[]`. A name-only entry keeps
 *  (on patch) or omits (on create) the stored package; an `upload_object_key`
 *  binds a freshly presigned-uploaded package. */
export interface SkillWrite {
  name: string
  upload_object_key?: string
  file_name?: string
  file_size?: number
}

// ─── Expert (single agent) ─────────────────────────────────────────────────

export interface ExpertListItem {
  expert_id: string
  short_name: string
  name: string
  summary: string
  category: string
  tags: string[]
  visibility: ExpertVisibility
  creator_name: string
  created_by_type?: string
  skill_count?: number
}

export interface ExpertDetail extends ExpertListItem {
  instruction: string
  mcp_config: string
  skills: SkillRef[]
  created_at: string
  updated_at: string
}

/** Flat create manifest (octo-cli parity). Visibility is stamped to `system`
 *  by the admin endpoint and short_name is server-derived from name, so
 *  callers omit both (the strict decoder rejects unknown fields). */
export interface CreateExpertParams {
  name: string
  summary: string
  category: string
  tags?: string[]
  instruction: string
  mcp_config: string
  skills: SkillWrite[]
}

/** Partial update — metadata only, or a full spec replacement. */
export interface PatchExpertParams {
  name?: string
  summary?: string
  category?: string
  tags?: string[]
  instruction?: string
  mcp_config?: string
  skills?: SkillWrite[]
}

// ─── Squad (expert team) ────────────────────────────────────────────────────

export interface SquadDependencies {
  blocking: string[]
  recommended: string[]
}

export interface SquadMember {
  member_key: string
  name: string
  role: string
  is_leader: boolean
  instruction: string
  mcp_config: string
  skills: SkillRef[]
}

export interface SquadMemberWrite {
  member_key: string
  name: string
  role: string
  is_leader: boolean
  instruction: string
  mcp_config: string
  skills: SkillWrite[]
}

export interface SquadListItem {
  squad_id: string
  short_name: string
  name: string
  summary: string
  category: string
  tags: string[]
  visibility: ExpertVisibility
  creator_name: string
  created_by_type?: string
  member_count?: number
}

export interface SquadDetail extends SquadListItem {
  leader: string
  strategies: string[]
  dependencies: SquadDependencies
  permission: string
  members: SquadMember[]
  created_at: string
  updated_at: string
}

export interface CreateSquadParams {
  name: string
  summary: string
  category: string
  tags?: string[]
  leader: string
  strategies?: string[]
  dependencies?: SquadDependencies
  permission?: string
  members: SquadMemberWrite[]
}

export interface PatchSquadParams {
  name?: string
  summary?: string
  category?: string
  tags?: string[]
  leader?: string
  strategies?: string[]
  dependencies?: SquadDependencies
  permission?: string
  members?: SquadMemberWrite[]
}

// ─── Categories / tags ──────────────────────────────────────────────────────

export interface ExpertCategory {
  expert_category_id: string
  name: string
  icon_key?: string
  sort_order: number
  count?: number
}

export interface ExpertTag {
  name: string
  count: number
}

// ─── List params + response projection ──────────────────────────────────────

export interface ListExpertParams {
  keyword?: string
  category?: string
  limit?: number
  offset?: number
}

export interface ListResponse<T> {
  items: T[]
  total: number
}

interface ListEnvelope<T> {
  data: T[]
  pagination?: { total: number; page: number; page_size: number }
}

function buildListQuery(params: ListExpertParams): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  const keyword = params.keyword?.trim()
  if (keyword) query.keyword = keyword
  query.category = params.category ?? 'all'
  // The admin list endpoints page by number (page/page_size), not
  // limit/offset — same translation as ./skill.ts.
  const pageSize = params.limit && params.limit > 0 ? params.limit : 20
  query.page_size = pageSize
  query.page =
    params.offset && params.offset > 0 ? Math.floor(params.offset / pageSize) + 1 : 1
  return query
}

// ─── Experts ────────────────────────────────────────────────────────────────

export async function listSystemExperts(
  params: ListExpertParams = {}
): Promise<ListResponse<ExpertListItem>> {
  const resp = await expertApi.get<ListEnvelope<ExpertListItem>>('/admin/experts', {
    params: buildListQuery(params),
  })
  return {
    items: resp.data.data ?? [],
    total: resp.data.pagination?.total ?? 0,
  }
}

export async function getSystemExpert(id: string): Promise<ExpertDetail> {
  const resp = await expertApi.get<{ data: ExpertDetail }>(
    `/admin/experts/${encodeURIComponent(id)}`
  )
  return resp.data.data
}

export async function createSystemExpert(
  params: CreateExpertParams
): Promise<ExpertDetail> {
  const resp = await expertApi.post<{ data: ExpertDetail }>('/admin/experts', params)
  return resp.data.data
}

export async function patchSystemExpert(
  id: string,
  params: PatchExpertParams
): Promise<ExpertDetail> {
  const resp = await expertApi.patch<{ data: ExpertDetail }>(
    `/admin/experts/${encodeURIComponent(id)}`,
    params
  )
  return resp.data.data
}

export async function deleteSystemExpert(id: string): Promise<void> {
  await expertApi.delete(`/admin/experts/${encodeURIComponent(id)}`)
}

/** Stored SKILL.md text of the expert's skill at `index`. */
export async function getSystemExpertSkillMd(id: string, index: number): Promise<string> {
  const resp = await expertApi.get<{ data: { content: string } }>(
    `/admin/experts/${encodeURIComponent(id)}/skill_md`,
    { params: { i: index } }
  )
  return resp.data.data.content
}

// ─── Squads ───────────────────────────────────────────────────────────────

export async function listSystemSquads(
  params: ListExpertParams = {}
): Promise<ListResponse<SquadListItem>> {
  const resp = await expertApi.get<ListEnvelope<SquadListItem>>('/admin/squads', {
    params: buildListQuery(params),
  })
  return {
    items: resp.data.data ?? [],
    total: resp.data.pagination?.total ?? 0,
  }
}

export async function getSystemSquad(id: string): Promise<SquadDetail> {
  const resp = await expertApi.get<{ data: SquadDetail }>(
    `/admin/squads/${encodeURIComponent(id)}`
  )
  return resp.data.data
}

export async function createSystemSquad(
  params: CreateSquadParams
): Promise<SquadDetail> {
  const resp = await expertApi.post<{ data: SquadDetail }>('/admin/squads', params)
  return resp.data.data
}

export async function patchSystemSquad(
  id: string,
  params: PatchSquadParams
): Promise<SquadDetail> {
  const resp = await expertApi.patch<{ data: SquadDetail }>(
    `/admin/squads/${encodeURIComponent(id)}`,
    params
  )
  return resp.data.data
}

export async function deleteSystemSquad(id: string): Promise<void> {
  await expertApi.delete(`/admin/squads/${encodeURIComponent(id)}`)
}

/** Stored SKILL.md text of a squad member's skill at `index`. */
export async function getSystemSquadSkillMd(
  id: string,
  memberKey: string,
  index: number
): Promise<string> {
  const resp = await expertApi.get<{ data: { content: string } }>(
    `/admin/squads/${encodeURIComponent(id)}/skill_md`,
    { params: { member: memberKey, i: index } }
  )
  return resp.data.data.content
}

// ─── Categories ─────────────────────────────────────────────────────────────

export async function listExpertCategories(): Promise<ExpertCategory[]> {
  const resp = await expertApi.get<{ data: ExpertCategory[] }>('/admin/expert_categories')
  return resp.data.data ?? []
}

export async function createExpertCategory(params: {
  name: string
  icon_key?: string
  sort_order?: number
}): Promise<ExpertCategory> {
  const resp = await expertApi.post<{ data: ExpertCategory }>(
    '/admin/expert_categories',
    params
  )
  return resp.data.data
}

export async function updateExpertCategory(
  id: string,
  params: { name?: string; icon_key?: string; sort_order?: number }
): Promise<ExpertCategory> {
  const resp = await expertApi.patch<{ data: ExpertCategory }>(
    `/admin/expert_categories/${encodeURIComponent(id)}`,
    params
  )
  return resp.data.data
}

export async function deleteExpertCategory(id: string): Promise<void> {
  await expertApi.delete(`/admin/expert_categories/${encodeURIComponent(id)}`)
}

// ─── Tags (read-only suggestions) ────────────────────────────────────────────

export async function listExpertTags(kind: ExpertKind): Promise<ExpertTag[]> {
  const resp = await expertApi.get<{ data: ExpertTag[] }>('/admin/expert_tags', {
    params: { kind },
  })
  return resp.data.data ?? []
}

// ─── Skill package upload (presigned, two-step) ──────────────────────────────

/** POST /admin/expert_skill_uploads response. Mirrors octo-cli's
 *  `expert-skill-upload create`. `upload_object_key` is what the caller
 *  references in a create/patch `skills[]` entry after PUTting the bytes. */
export interface ExpertSkillUploadInit {
  upload_object_key: string
  presigned_url: string
  method: string
  headers: Record<string, string>
  expires_in?: number
}

/** Two-step skill-package upload: presign, then PUT the raw `.zip/.skill`
 *  bytes directly to the returned URL, then hand back a ready `SkillWrite`
 *  entry. The container zip is never uploaded — only its bundled packages. */
export async function uploadExpertSkill(
  name: string,
  file: File | Blob,
  fileName: string
): Promise<SkillWrite> {
  const size = file.size
  const initResp = await expertApi.post<{ data: ExpertSkillUploadInit }>(
    '/admin/expert_skill_uploads',
    { file_name: fileName, file_size: size }
  )
  const { upload_object_key, presigned_url, method, headers } = initResp.data.data
  await putPresignedFile(
    presigned_url,
    file instanceof File ? file : new File([file], fileName),
    { method, headers: headers ?? {} }
  )
  return {
    name,
    upload_object_key,
    file_name: fileName,
    file_size: size,
  }
}
