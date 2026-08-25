/**
 * octo-marketplace admin Skill management client.
 *
 * Uses the shared marketplace axios instance from ./marketplace, which
 * handles baseURL, auth token injection, Accept-Language, and error-envelope
 * normalization. Marketplace admits only role=superAdmin on the /admin/*
 * namespace; this file trusts that gate and only adds resource-specific
 * types + endpoint wrappers.
 *
 * The backend response envelope for lists is:
 *   { data: T[], pagination: { total, page, page_size } }
 * For single items:
 *   { data: T }
 */

import { marketplaceApi as skillApi, putPresignedFile } from './marketplace'
import { ApiError } from './index'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CategoryItem {
  skill_category_id: string
  id: string
  name: string
  icon_key: string
  sort_order: number
  skill_count: number
}

export interface SkillListItem {
  skill_id: string
  id: string
  name: string
  display_name: string
  icon_url: string
  description: string
  category_id: string
  category_name?: string
  tags: string[]
  owner_name: string
  visibility: string
  version: string
  file_name: string
  file_size: number
  file_sha256?: string
  file_url?: string
  owner_id?: string
  space_id?: string
  view_count: number
  download_count: number
  created_at: string
  updated_at: string
}

export interface SkillDetail extends SkillListItem {
  readme_content?: string
}

export interface ListSkillsParams {
  q?: string
  category_id?: string
  tags?: string
  sort?: string
  page?: number
  offset?: number
  page_size?: number
}

export interface ListSkillsResponse {
  items: SkillListItem[]
  total: number
  page: number
  page_size: number
}

export interface CreateSkillParams {
  parse_task_id?: string
  upload_id?: string
  name?: string
  display_name?: string
  description?: string
  category_id?: string
  tags?: string[]
  version?: string
  changelog?: string
  visibility?: 'public' | 'space' | 'private'
  icon_url?: string
}

export interface PatchSkillParams {
  name?: string
  display_name?: string
  description?: string
  category_id?: string
  tags?: string[]
  version?: string
  changelog?: string
  visibility?: 'public' | 'space' | 'private'
  icon_url?: string
}

export type UpdateSkillParams = PatchSkillParams

export interface UploadInitResponse {
  upload_id: string
  presigned_url: string
  method?: string
  headers?: Record<string, string>
  expires_in?: number
}

export interface ParseTaskStatus {
  id: string
  status: 'pending' | 'parsing' | 'success' | 'failed'
  error_message?: string
  result_name?: string
  result_description?: string
  result_version?: string
  result_tags?: string[]
  result_readme?: string
  result_file_name?: string
  result_file_size?: number
  result_file_sha256?: string
}

export interface SkillListParams {
  q?: string
  category_id?: string
  cursor?: string
  limit?: number
}

export interface SkillListResponse {
  items: SkillListItem[]
  next_cursor: string | null
}

function normalizeCategory(item: Partial<CategoryItem>): CategoryItem {
  const id = item.skill_category_id || item.id || ''
  return {
    skill_category_id: id,
    id,
    name: item.name || '',
    icon_key: item.icon_key || '',
    sort_order: item.sort_order ?? 0,
    skill_count: item.skill_count ?? 0,
  }
}

function normalizeSkill<T extends Partial<SkillListItem>>(item: T): SkillListItem & T {
  const id = item.skill_id || item.id || ''
  return {
    ...item,
    skill_id: id,
    id,
    name: item.name || '',
    display_name: item.display_name || item.name || '',
    icon_url: item.icon_url || '',
    description: item.description || '',
    category_id: item.category_id || '',
    tags: item.tags || [],
    owner_name: item.owner_name || '',
    visibility: item.visibility || 'public',
    version: item.version || '',
    file_name: item.file_name || '',
    file_size: item.file_size ?? 0,
    view_count: item.view_count ?? 0,
    download_count: item.download_count ?? 0,
    created_at: item.created_at || '',
    updated_at: item.updated_at || '',
  } as SkillListItem & T
}

const parseTaskByUploadId = new Map<string, string>()

// ─── Unified plugin translation layer (internal) ───────────────────────────
//
// Admin skill catalog reads/writes now target octo-marketplace's UNIFIED
// plugin surface (`/admin/plugins*`, plugin_type=skill). The snake_case
// SkillListItem/SkillDetail shapes the pages consume are mapped from the
// plugin wire model here; the upload → parse → create/reupload pipeline, the
// SKILL.md / download endpoints, and ALL category functions stay on their
// legacy /admin/skill* routes. The mapping mirrors octo-web's
// dmworkskillmarket/skillApiReal against the same backend.

interface PluginManifestWire {
  $schema?: string
  plugin_name?: string
  plugin_type?: string
  name?: string
  description?: string
  labels?: string[]
  examples?: { title: string; input: string }[]
}

interface PluginAttachmentWire {
  path: string
  content_type: 'raw' | 'storage'
  mime_type?: string
  raw_content?: string
  storage_uri?: string
  content_size?: number
  content_hash?: string
}

interface PluginPackageWire {
  $schema?: string
  attachments?: PluginAttachmentWire[]
}

interface PluginListItemWire {
  plugin_id: string
  plugin_name: string
  plugin_type: string
  manifest_json?: PluginManifestWire
  tags?: unknown
  category_id?: string
  icon?: string
  icon_url?: string
  publisher?: string
  owner_id?: string
  space_id?: string
  visibility?: string
  creator_name?: string
  current_version?: string
  view_count?: number
  download_count?: number
  created_at?: string
  updated_at?: string
}

interface PluginDetailPluginWire extends PluginListItemWire {
  plugin_json?: PluginPackageWire
}

interface PluginCategoryWire {
  category_id: string
  name: string
  icon_key?: string
  plugin_types?: string[]
  sort_order?: number
  plugin_count?: number
}

/** skill/ref.json attachment: legacy artifact pointers preserved by backfill. */
interface SkillRefWire {
  file_name?: string
  file_size?: number
  file_sha256?: string
  file_url?: string
  object_key?: string
  zip_object_key?: string
}

/** Safely coerce tags to string[]. Backend may return a JSON-encoded string. */
function normalizeTagsList(tags: unknown): string[] {
  if (Array.isArray(tags))
    return tags.filter((t): t is string => typeof t === 'string')
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags)
      if (Array.isArray(parsed))
        return parsed.filter((t): t is string => typeof t === 'string')
    } catch {
      /* not JSON — treat as a single tag */
    }
    return tags.trim() ? [tags.trim()] : []
  }
  return []
}

function rawAttachment(
  pkg: PluginPackageWire | undefined,
  path: string
): string | undefined {
  const hit = (pkg?.attachments ?? []).find(
    (a) => a.path === path && a.content_type === 'raw'
  )
  return hit?.raw_content
}

function jsonAttachment<T>(
  pkg: PluginPackageWire | undefined,
  path: string
): T | undefined {
  const raw = rawAttachment(pkg, path)
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/** Legacy SkillSort → unified list sort. */
function mapSkillSort(sort?: string): string | undefined {
  if (!sort) return undefined
  if (sort === 'latest') return 'newest'
  return sort
}

/** GET /admin/plugin_categories?plugin_type=skill → category_id → name map,
 *  used to enrich SkillDetail.category_name (the unified wire keys by UUID). */
async function fetchSkillCategoryNameMap(): Promise<Map<string, string>> {
  const resp = await skillApi.get<{ data: PluginCategoryWire[] }>(
    '/admin/plugin_categories',
    { params: { plugin_type: 'skill' } }
  )
  const map = new Map<string, string>()
  for (const c of resp.data.data ?? []) map.set(c.category_id, c.name)
  return map
}

function mapPluginToSkillListItem(
  raw: PluginListItemWire,
  idToName?: Map<string, string>
): SkillListItem {
  const manifest = raw.manifest_json ?? {}
  const categoryId = raw.category_id ?? ''
  return normalizeSkill({
    skill_id: raw.plugin_id,
    id: raw.plugin_id,
    // The manifest machine name is the legacy skill `name`; plugin_name is the
    // display name.
    name: manifest.name || raw.plugin_name || '',
    display_name: raw.plugin_name || '',
    icon_url: raw.icon_url || raw.icon || '',
    description: manifest.description || '',
    category_id: categoryId,
    category_name: idToName?.get(categoryId),
    tags: normalizeTagsList(raw.tags),
    // Backfill preserved the legacy owner display name in publisher.
    owner_name: raw.publisher || raw.creator_name || '',
    visibility: raw.visibility || 'public',
    version: raw.current_version || '',
    file_name: '',
    file_size: 0,
    owner_id: raw.owner_id,
    space_id: raw.space_id,
    view_count: raw.view_count ?? 0,
    download_count: raw.download_count ?? 0,
    created_at: raw.created_at || '',
    updated_at: raw.updated_at || '',
  })
}

function mapPluginToSkillDetail(
  plugin: PluginDetailPluginWire,
  idToName?: Map<string, string>
): SkillDetail {
  const base = mapPluginToSkillListItem(plugin, idToName)
  const attachments = plugin.plugin_json?.attachments ?? []
  const readmeContent = rawAttachment(plugin.plugin_json, 'SKILL.md') ?? ''
  const isLegacy = attachments.some(
    (a) => a.path === 'skill/ref.json' || a.path === 'skill/package.zip'
  )
  if (isLegacy) {
    const ref =
      jsonAttachment<SkillRefWire>(plugin.plugin_json, 'skill/ref.json') ?? {}
    const managedZip = attachments.find(
      (a) => a.path === 'skill/package.zip' && a.content_type === 'storage'
    )
    return {
      ...base,
      readme_content: readmeContent,
      file_name: ref.file_name ?? (managedZip ? 'skill.zip' : ''),
      file_url: managedZip?.storage_uri ?? ref.zip_object_key ?? ref.file_url ?? '',
      file_size: ref.file_size ?? managedZip?.content_size ?? 0,
      file_sha256: ref.file_sha256,
    }
  }
  // Tree shape: files live directly in attachments; download is rebuilt
  // server-side, so metadata is derived from the tree rather than a pointer.
  const hasFiles = attachments.some((a) => a.path !== 'SKILL.md')
  const totalSize = attachments.reduce((n, a) => n + (a.content_size ?? 0), 0)
  return {
    ...base,
    readme_content: readmeContent,
    file_name: hasFiles ? `${base.name}.zip` : '',
    file_size: totalSize,
  }
}

/** GET /admin/plugins/{id}?include_relations=true → { plugin, relations }. */
async function fetchSkillPluginDetail(
  id: string
): Promise<PluginDetailPluginWire> {
  const resp = await skillApi.get<{
    data: { plugin: PluginDetailPluginWire; relations: unknown[] }
  }>(`/admin/plugins/${encodeURIComponent(id)}`, {
    params: { include_relations: true },
  })
  return resp.data.data.plugin
}

// ─── Category API ────────────────────────────────────────────────────────────

export async function listSkillCategories(): Promise<CategoryItem[]> {
  const resp = await skillApi.get<{ data: CategoryItem[] }>('/admin/skill_categories')
  return resp.data.data.map(normalizeCategory)
}

export async function createSkillCategory(params: {
  name: string
  sort_order?: number
}): Promise<CategoryItem> {
  const resp = await skillApi.post<{ data: CategoryItem }>('/admin/skill_categories', params)
  return normalizeCategory(resp.data.data)
}

export async function updateSkillCategory(
  id: string,
  params: { name?: string; sort_order?: number }
): Promise<CategoryItem> {
  const resp = await skillApi.patch<{ data: CategoryItem }>(
    `/admin/skill_categories/${encodeURIComponent(id)}`,
    params
  )
  return normalizeCategory(resp.data.data)
}

export async function deleteSkillCategory(id: string): Promise<void> {
  await skillApi.delete(`/admin/skill_categories/${encodeURIComponent(id)}`)
}

// ─── Skill API ───────────────────────────────────────────────────────────────

/**
 * List admin skills against the unified plugin surface
 * (GET /admin/plugins?plugin_type=skill). Backend returns:
 *   { data: PluginListItem[], pagination: { total, page, page_size } }
 */
export async function listAdminSkills(
  params: ListSkillsParams = {}
): Promise<ListSkillsResponse> {
  const query: Record<string, unknown> = { plugin_type: 'skill' }
  if (params.q?.trim()) query.q = params.q.trim()
  if (params.category_id) query.category_id = params.category_id
  if (params.tags) query.tag = params.tags
  const sort = mapSkillSort(params.sort)
  if (sort) query.sort = sort
  const pageSize =
    params.page_size && params.page_size > 0 ? params.page_size : 20
  query.page_size = pageSize
  if (params.page && params.page > 0) {
    query.page = params.page
  } else if (params.offset != null && params.offset > 0) {
    query.page = Math.floor(params.offset / pageSize) + 1
  } else {
    query.page = 1
  }
  const resp = await skillApi.get<{
    data: PluginListItemWire[]
    pagination: { total: number; page: number; page_size: number }
  }>('/admin/plugins', { params: query })
  return {
    items: (resp.data.data ?? []).map((raw) => mapPluginToSkillListItem(raw)),
    total: resp.data.pagination.total,
    page: resp.data.pagination.page,
    page_size: resp.data.pagination.page_size,
  }
}

export async function getAdminSkill(id: string): Promise<SkillDetail> {
  const [plugin, idToName] = await Promise.all([
    fetchSkillPluginDetail(id),
    fetchSkillCategoryNameMap(),
  ])
  return mapPluginToSkillDetail(plugin, idToName)
}

export async function createAdminSkill(params: CreateSkillParams): Promise<SkillDetail> {
  const resp = await skillApi.post<{ data: SkillDetail }>('/admin/skills', params)
  return normalizeSkill(resp.data.data)
}

/**
 * Metadata-only edit against the unified plugin surface. The upsert is a full
 * replace, so we fetch the current detail, rebuild the canonical manifest_json
 * from the new name/description/labels, and resubmit the EXISTING plugin_json
 * attachments unchanged (dropping any legacy embedded manifest.json), plus the
 * top-level category_id/tags/icon. The server preserves the row's existing
 * visibility/space/owner. Version/changelog bumps are handled by the reupload
 * pipeline (commitAdminSkillReupload), not this path.
 */
export async function updateAdminSkill(
  id: string,
  params: PatchSkillParams
): Promise<SkillDetail> {
  const plugin = await fetchSkillPluginDetail(id)
  const manifest = plugin.manifest_json ?? {}
  const displayName = params.display_name ?? plugin.plugin_name ?? ''
  const name = params.name ?? manifest.name ?? plugin.plugin_name ?? ''
  const description = params.description ?? manifest.description ?? ''
  const tags = normalizeTagsList(params.tags ?? plugin.tags)
  const visibility = params.visibility ?? plugin.visibility
  const icon = params.icon_url !== undefined ? params.icon_url : plugin.icon ?? ''
  const categoryId =
    params.category_id !== undefined ? params.category_id : plugin.category_id
  const newManifest: PluginManifestWire = {
    $schema: 'cowork-plugin-manifest-1.0.json',
    plugin_name: displayName,
    plugin_type: 'skill',
    name,
    description,
    labels: tags,
    examples: manifest.examples ?? [],
  }
  const attachments = (plugin.plugin_json?.attachments ?? []).filter(
    (a) => a.path !== 'manifest.json'
  )
  await skillApi.patch(`/admin/plugins/${encodeURIComponent(id)}`, {
    plugin: {
      plugin_id: id,
      plugin_name: displayName,
      plugin_type: 'skill',
      ...(categoryId ? { category_id: categoryId } : {}),
      tags,
      icon,
      visibility,
      manifest_json: newManifest,
      plugin_json: {
        $schema: 'cowork-plugin-package-1.0.json',
        attachments,
      },
    },
    relations: [],
  })
  return getAdminSkill(id)
}

export interface CommitReuploadParams {
  parse_task_id: string
  version?: string
  changelog?: string
  tags?: string[]
}

export async function commitAdminSkillReupload(
  skillId: string,
  params: CommitReuploadParams
): Promise<SkillDetail> {
  const resp = await skillApi.post<{ data: SkillDetail }>(
    `/admin/skills/${encodeURIComponent(skillId)}/reupload`,
    params
  )
  return normalizeSkill(resp.data.data)
}

export async function deleteAdminSkill(id: string): Promise<void> {
  await skillApi.delete(`/admin/plugins/${encodeURIComponent(id)}`)
}

export async function getSkillMd(id: string): Promise<string> {
  const resp = await skillApi.get<{ data: { content: string } }>(
    `/admin/skills/${encodeURIComponent(id)}/skill_md`
  )
  return resp.data.data.content || ''
}

// ─── Download ────────────────────────────────────────────────────────────────

export interface DownloadInfo {
  download_url: string
  file_sha256: string
}

/** Get a presigned download URL for a public skill archive (admin). */
export async function getAdminSkillDownloadUrl(id: string): Promise<string> {
  const resp = await skillApi.get<{ data: DownloadInfo }>(
    `/admin/skills/${encodeURIComponent(id)}/download`,
    { params: { format: 'json' } }
  )
  return resp.data.data.download_url
}

// ─── Upload flow (presigned URL) ─────────────────────────────────────────────

/**
 * The admin upload flow:
 * 1. POST /admin/skill_uploads { file_name, file_size } → { skill_upload_id, presigned_url, method, headers }
 * 2. PUT file bytes to presigned_url
 * 3. POST /admin/skill_uploads/:id/parse → { skill_parse_task_id }
 * 4. GET /admin/skill_parse_tasks/:id → poll until status=success
 * 5. POST /admin/skills { parse_task_id, name, ... } → created skill
 */

export interface InitUploadResult {
  skill_upload_id: string
  presigned_url: string
  method: string
  headers: Record<string, string>
  object_key: string
}

export async function initAdminSkillUpload(fileName: string, fileSize: number): Promise<InitUploadResult> {
  const resp = await skillApi.post<{ data: InitUploadResult }>('/admin/skill_uploads', {
    file_name: fileName,
    file_size: fileSize,
  })
  return resp.data.data
}

export async function initReupload(
  _skillId: string,
  fileName: string,
  fileSize: number
): Promise<UploadInitResponse> {
  // octo-marketplace-dev exposes admin upload init as /admin/skill_uploads.
  // The later /admin/skills/:id/reupload commit validates and binds the
  // parsed task to the target skill, so the init step can use the same admin
  // upload endpoint as first-time creation.
  const result = await initAdminSkillUpload(fileName, fileSize)
  return {
    upload_id: result.skill_upload_id,
    presigned_url: result.presigned_url,
    method: result.method,
    headers: result.headers ?? {},
  }
}

export async function triggerAdminParse(uploadId: string): Promise<string> {
  const resp = await skillApi.post<{ data: { skill_parse_task_id: string } }>(
    `/admin/skill_uploads/${encodeURIComponent(uploadId)}/parse`
  )
  const taskId = resp.data.data.skill_parse_task_id
  parseTaskByUploadId.set(uploadId, taskId)
  return taskId
}

export interface ParseTaskResult {
  status: string
  skill_parse_task_id: string
  result?: {
    name: string
    description?: string
    version: string
    tags: string[]
    readme_content?: string
    file_name: string
    file_size: number
    file_sha256: string
  }
  error?: { code: string; message: string }
}

export async function pollAdminParseTask(taskId: string): Promise<ParseTaskResult> {
  const resp = await skillApi.get<{ data: ParseTaskResult }>(
    `/admin/skill_parse_tasks/${encodeURIComponent(taskId)}`
  )
  return resp.data.data
}

/**
 * Full upload + parse flow for admin skill creation.
 * Returns the parse_task_id once parsing completes successfully.
 * Throws on failure.
 */
export async function uploadAndParseSkillZip(
  file: File,
  onProgress?: (stage: 'uploading' | 'parsing', progress?: number) => void
): Promise<{ parseTaskId: string; result: ParseTaskResult['result'] }> {
  // 1. Init upload
  onProgress?.('uploading')
  const init = await initAdminSkillUpload(file.name, file.size)

  // 2. PUT file to presigned URL
  await putPresignedFile(init.presigned_url, file, {
    method: init.method,
    headers: init.headers ?? {},
  })

  // 3. Trigger parse
  onProgress?.('parsing')
  const taskId = await triggerAdminParse(init.skill_upload_id)

  // 4. Poll until done
  const maxAttempts = 60
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const task = await pollAdminParseTask(taskId)
    if (task.status === 'success') {
      return { parseTaskId: taskId, result: task.result }
    }
    if (task.status === 'failed') {
      throw new ApiError(
        task.error?.message || 'Parse failed',
        400,
        task.error?.code
      )
    }
    // still parsing - continue polling
  }
  throw new ApiError('Parse timed out', 408)
}

/** Reupload flow: same presigned steps, then call /admin/skills/:id/reupload with parse_task_id. */
export async function reuploadAdminSkill(
  skillId: string,
  file: File,
  params: { version?: string; changelog?: string; tags?: string[] },
  onProgress?: (stage: 'uploading' | 'parsing') => void
): Promise<SkillDetail> {
  const { parseTaskId } = await uploadAndParseSkillZip(file, onProgress)
  return commitAdminSkillReupload(skillId, {
    parse_task_id: parseTaskId,
    version: params.version,
    changelog: params.changelog,
    tags: params.tags,
  })
}

// ─── Compatibility exports for the legacy SystemSkill page ──────────────────

export async function listSkills(
  params: SkillListParams = {}
): Promise<SkillListResponse> {
  const offset = params.cursor ? Number(params.cursor) || 0 : 0
  const pageSize = params.limit || 20
  const page = Math.floor(offset / pageSize) + 1
  const resp = await listAdminSkills({
    q: params.q,
    category_id: params.category_id,
    page,
    page_size: pageSize,
  })
  const nextOffset = offset + resp.items.length
  return {
    items: resp.items,
    next_cursor: nextOffset < resp.total ? String(nextOffset) : null,
  }
}

export const getSkill = getAdminSkill

export const deleteSkill = deleteAdminSkill

export const updateSkill = updateAdminSkill

export async function uploadInit(
  fileName: string,
  fileSize: number
): Promise<UploadInitResponse> {
  const result = await initAdminSkillUpload(fileName, fileSize)
  return {
    upload_id: result.skill_upload_id,
    presigned_url: result.presigned_url,
    method: result.method,
    headers: result.headers ?? {},
  }
}

export async function uploadToPresigned(
  presignedUrl: string,
  file: File,
  headers: Record<string, string> = {},
  onProgress?: (progress: number) => void
): Promise<void> {
  onProgress?.(30)
  await putPresignedFile(presignedUrl, file, {
    headers: Object.keys(headers).length
      ? headers
      : { 'Content-Type': 'application/octet-stream' },
  })
  onProgress?.(60)
}

export async function triggerParse(uploadId: string): Promise<{ task_id: string }> {
  return { task_id: await triggerAdminParse(uploadId) }
}

export async function getParseStatus(taskId: string): Promise<ParseTaskStatus> {
  const task = await pollAdminParseTask(taskId)
  return {
    id: task.skill_parse_task_id || taskId,
    status: task.status as ParseTaskStatus['status'],
    error_message: task.error?.message,
    result_name: task.result?.name,
    result_description: task.result?.description,
    result_version: task.result?.version,
    result_tags: task.result?.tags,
    result_readme: task.result?.readme_content,
    result_file_name: task.result?.file_name,
    result_file_size: task.result?.file_size,
    result_file_sha256: task.result?.file_sha256,
  }
}

export async function createSkill(data: CreateSkillParams): Promise<SkillDetail> {
  return createAdminSkill({
    ...data,
    parse_task_id: data.parse_task_id || (data.upload_id ? parseTaskByUploadId.get(data.upload_id) : undefined),
  })
}

export async function uploadIcon(file: File): Promise<{ object_key: string }> {
  // Mirrors octo-web's dmworkskillmarket icon flow: initialize through the
  // shared skill icon endpoint, PUT bytes to the returned presigned URL, then
  // persist the returned object_key on the skill metadata. The surrounding
  // admin CRUD still uses /admin/* endpoints.
  const resp = await skillApi.post<{
    data: {
      object_key: string
      presigned_url: string
      method?: string
      headers?: Record<string, string>
    }
  }>('/skill_icon_uploads', {
    file_name: file.name,
    file_size: file.size,
  })
  const init = resp.data.data
  if (!init?.object_key || !init?.presigned_url) {
    throw new ApiError('Upload response is missing required fields', 502, 'invalid_response')
  }
  await putPresignedFile(init.presigned_url, file, {
    method: init.method,
    headers: init.headers ?? {},
  })
  return { object_key: init.object_key }
}

export const listCategories = listSkillCategories

export async function createCategory(data: {
  name: string
  icon_key: string
}): Promise<CategoryItem> {
  return createSkillCategory({
    name: data.name,
    sort_order: 0,
  })
}

export async function updateCategory(
  id: string,
  data: { name?: string; icon_key?: string; sort_order?: number }
): Promise<CategoryItem> {
  return updateSkillCategory(id, {
    name: data.name,
    sort_order: data.sort_order,
  })
}

export const deleteCategory = deleteSkillCategory
