/**
 * octo-marketplace admin Skill management client.
 *
 * Distinct from the shared `../api` axios instance because marketplace mounts
 * under `/market/api/v1` and returns its own response envelope. Auth uses the
 * caller's own Octo login token; marketplace verifies it with octo-server and
 * enforces superAdmin server-side. No marketplace administrator credential is
 * shipped to the browser.
 *
 * The backend response envelope for lists is:
 *   { data: T[], pagination: { total, page, page_size } }
 * For single items:
 *   { data: T }
 */

import axios, { AxiosError } from 'axios'
import i18n, { FALLBACK_LANGUAGE } from '../i18n'
import { ApiError } from './index'
import { useAuthStore } from '../store/auth'

const MARKETPLACE_BASE =
  import.meta.env.VITE_MARKETPLACE_API_BASE || '/market/api/v1'

const skillApi = axios.create({
  baseURL: MARKETPLACE_BASE,
  timeout: 30000,
})

skillApi.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.token = token
  }
  config.headers['Accept-Language'] =
    i18n.resolvedLanguage ?? FALLBACK_LANGUAGE
  return config
})

skillApi.interceptors.response.use(
  (response) => response,
  (
    error: AxiosError<{
      error?: { code?: string; message?: string; details?: Record<string, unknown> }
      err?: { code?: string; message?: string; details?: Record<string, unknown> }
    }>
  ) => {
    const wire = error.response?.data?.error ?? error.response?.data?.err
    const message = wire?.message || wire?.code || error.message
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/admin/login'
    }
    return Promise.reject(
      new ApiError(message, error.response?.status, wire?.code, wire?.details)
    )
  }
)

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
 * List admin skills. Backend returns:
 *   { data: SkillItem[], pagination: { total, page, page_size } }
 */
export async function listAdminSkills(
  params: ListSkillsParams = {}
): Promise<ListSkillsResponse> {
  const query: Record<string, unknown> = {}
  if (params.q?.trim()) query.q = params.q.trim()
  if (params.category_id) query.category_id = params.category_id
  if (params.tags) query.tags = params.tags
  if (params.sort) query.sort = params.sort
  if (params.page_size && params.page_size > 0) query.page_size = params.page_size
  if (params.page && params.page > 0) {
    query.page = params.page
  } else if (params.offset != null && params.offset > 0) {
    const pageSize = params.page_size && params.page_size > 0 ? params.page_size : 20
    query.page = Math.floor(params.offset / pageSize) + 1
  }
  const resp = await skillApi.get<{
    data: SkillListItem[]
    pagination: { total: number; page: number; page_size: number }
  }>('/admin/skills', { params: query })
  return {
    items: resp.data.data.map(normalizeSkill),
    total: resp.data.pagination.total,
    page: resp.data.pagination.page,
    page_size: resp.data.pagination.page_size,
  }
}

export async function getAdminSkill(id: string): Promise<SkillDetail> {
  const resp = await skillApi.get<{ data: SkillDetail }>(
    `/admin/skills/${encodeURIComponent(id)}`
  )
  return normalizeSkill(resp.data.data)
}

export async function createAdminSkill(params: CreateSkillParams): Promise<SkillDetail> {
  const resp = await skillApi.post<{ data: SkillDetail }>('/admin/skills', params)
  return normalizeSkill(resp.data.data)
}

export async function updateAdminSkill(
  id: string,
  params: PatchSkillParams
): Promise<SkillDetail> {
  const resp = await skillApi.patch<{ data: SkillDetail }>(
    `/admin/skills/${encodeURIComponent(id)}`,
    params
  )
  return normalizeSkill(resp.data.data)
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
  await skillApi.delete(`/admin/skills/${encodeURIComponent(id)}`)
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

function assertSafeExternalUrl(raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ApiError('Invalid upload URL', 502, 'invalid_response')
  }

  if (url.protocol === 'https:') return
  if (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  ) {
    return
  }

  throw new ApiError('Upload URL scheme is not allowed', 502, 'invalid_response')
}

async function putPresignedFile(
  presignedUrl: string,
  file: File,
  options: {
    method?: string
    headers?: Record<string, string>
  } = {}
): Promise<void> {
  assertSafeExternalUrl(presignedUrl)
  const putResp = await fetch(presignedUrl, {
    method: options.method || 'PUT',
    headers: options.headers ?? {},
    body: file,
  })
  if (!putResp.ok) {
    throw new ApiError(`Upload failed (${putResp.status})`, putResp.status)
  }
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
