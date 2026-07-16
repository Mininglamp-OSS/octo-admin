/**
 * octo-marketplace admin client.
 *
 * Distinct from the shared `../api` axios instance for two reasons:
 *   1. Different origin — marketplace mounts under `/market/api/v1` (per
 *      octo-marketplace/docs/api/mcp-v1.md §1). Requests are routed via the
 *      vite `/market/*` proxy in dev and the nginx `/market/*` rewrite in
 *      prod, then land at marketplace as `/api/v1/*`.
 *   2. Different error envelope — marketplace ships `{err:{code,message}}`
 *      (doc §2); the primary admin backend uses
 *      `{error:{code,http_status,message}}`. The response interceptor here
 *      normalizes both into the shared `ApiError` type.
 *
 * Auth: the caller's own Octo login token (same header the shared axios
 * instance sends). Marketplace resolves it via octo-server /v1/auth/verify
 * and admits only role=superAdmin on the /admin/* namespace (mcp-v1.md
 * §9.1). No shared secret in the browser bundle.
 */

import axios, { AxiosError } from 'axios'
import i18n, { FALLBACK_LANGUAGE } from '../i18n'
import { ApiError } from './index'
import { useAuthStore } from '../store/auth'

const MARKETPLACE_BASE =
  import.meta.env.VITE_MARKETPLACE_API_BASE || '/market/api/v1'

const mcpApi = axios.create({
  baseURL: MARKETPLACE_BASE,
  timeout: 30000,
})

mcpApi.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.token = token
  }
  config.headers['Accept-Language'] =
    i18n.resolvedLanguage ?? FALLBACK_LANGUAGE
  return config
})

mcpApi.interceptors.response.use(
  (response) => response,
  (
    error: AxiosError<{
      err?: { code?: string; message?: string }
    }>
  ) => {
    const wire = error.response?.data?.err
    const message = wire?.message || wire?.code || error.message
    // 401 from marketplace means the admin's Octo token expired or was
    // revoked at octo-server. Mirror the shared axios interceptor
    // (../api/index.ts) so the auth store clears and the user is bounced
    // to /login rather than left on a broken page firing more 401s.
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/admin/login'
    }
    return Promise.reject(
      new ApiError(message, error.response?.status, wire?.code)
    )
  }
)

// ─── Types (mirrors octo-marketplace/docs/api/mcp-v1.md §3) ───────────────

export type McpVisibility = 'public' | 'private' | 'system'
export type McpTransport = 'stdio' | 'streamable-http' | 'sse'
export type McpAuthType = 'bearer' | 'none'

export interface McpTool {
  name: string
  description: string
}

export interface McpFaq {
  question: string
  answer: string
}

export interface McpQuickStart {
  transport: McpTransport
  serverName: string
  /** ASCII identifier used as the JSON key in the generated mcpServers
   *  snippet (mcp-v1.md §3, "服务标识"). Present on records created after
   *  migration 03; matches `^[a-z0-9-]{1,64}$`. Empty on legacy rows. */
  slug?: string
  url?: string
  authType?: McpAuthType
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
}

/** List projection returned by GET /admin/api/v1/mcps (doc §3.2 superset). */
export interface McpListItem {
  id: string
  name: string
  slogan: string
  category: string
  icon: string
  tags: string[]
  toolCount: number
  visibility: McpVisibility
  creatorName: string
}

/** Full record returned by POST/GET/PATCH /admin/api/v1/mcps (doc §3.1). */
export interface McpDetail extends McpListItem {
  quickStart: McpQuickStart
  tools: McpTool[]
  usageExamples: string[]
  faqs: McpFaq[]
  notes: string[]
  createdAt: string
  updatedAt: string
}

/** Create body — flat shape per doc §3.3. Visibility is stripped by the
 *  admin endpoint (always stamped to `system`) so callers may omit it. */
export interface CreateMcpParams {
  name: string
  /** Optional ASCII identifier. When empty the server auto-slugifies name.
   *  Must match `^[a-z0-9-]{1,64}$` when provided. */
  slug?: string
  category: string
  icon?: string
  tags?: string[]
  slogan?: string
  transport: McpTransport
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  authType?: McpAuthType
  tools: McpTool[]
  usageExamples?: string[]
  faqs?: McpFaq[]
  notes?: string[]
}

export interface ListMcpParams {
  keyword?: string
  category?: string
  limit?: number
  offset?: number
}

export interface ListMcpResponse {
  items: McpListItem[]
  total: number
  categories: { key: string; count: number }[]
}

/** PATCH body — every field optional (doc §4.5 shape). The marketplace admin
 *  surface rejects any `visibility` other than "system"; we omit it so callers
 *  cannot accidentally demote a system MCP. */
export interface PatchMcpParams {
  name?: string
  slug?: string
  category?: string
  icon?: string
  tags?: string[]
  slogan?: string
  transport?: McpTransport
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  authType?: McpAuthType
  tools?: McpTool[]
  usageExamples?: string[]
  faqs?: McpFaq[]
  notes?: string[]
}

// ─── Public functions ─────────────────────────────────────────────────────

/** GET /admin/api/v1/mcps — list every visibility=system record. */
export async function listSystemMcps(
  params: ListMcpParams = {}
): Promise<ListMcpResponse> {
  const query: Record<string, unknown> = {}
  const keyword = params.keyword?.trim()
  if (keyword) query.keyword = keyword
  query.category = params.category ?? 'all'
  if (params.limit && params.limit > 0) query.limit = params.limit
  if (params.offset && params.offset > 0) query.offset = params.offset
  const resp = await mcpApi.get<ListMcpResponse>('/admin/mcps', {
    params: query,
  })
  return resp.data
}

/** POST /admin/api/v1/mcps — create a system MCP. */
export async function createSystemMcp(
  params: CreateMcpParams
): Promise<McpDetail> {
  const resp = await mcpApi.post<McpDetail>('/admin/mcps', params)
  return resp.data
}

/** GET /admin/api/v1/mcps/{id} — fetch full detail for a system MCP. */
export async function getSystemMcp(id: string): Promise<McpDetail> {
  const resp = await mcpApi.get<McpDetail>(`/admin/mcps/${encodeURIComponent(id)}`)
  return resp.data
}

/** PATCH /admin/api/v1/mcps/{id} — partial update. Any admin can edit any
 *  system MCP (no ownership check server-side). */
export async function updateSystemMcp(
  id: string,
  params: PatchMcpParams
): Promise<McpDetail> {
  const resp = await mcpApi.patch<McpDetail>(
    `/admin/mcps/${encodeURIComponent(id)}`,
    params
  )
  return resp.data
}

/** DELETE /admin/api/v1/mcps/{id} — soft delete. */
export async function deleteSystemMcp(id: string): Promise<void> {
  await mcpApi.delete(`/admin/mcps/${encodeURIComponent(id)}`)
}

// ─── Probe ────────────────────────────────────────────────────────────────

/** POST /admin/api/v1/mcps/probe body. Mirrors service.ProbeRequest exactly
 *  — the marketplace decodes with DisallowUnknownFields, so any extra field
 *  (like a UI-only authType) is rejected as "request body is not valid
 *  JSON". A Bearer token, when set, lives inside `headers.Authorization`
 *  and reaches the remote MCP through that path. Only remote transports
 *  (streamable-http / sse) are probable — stdio needs a desktop runtime. */
export interface McpProbeRequest {
  transport: McpTransport
  url?: string
  headers?: Record<string, string>
}

/** POST /admin/api/v1/mcps/probe response envelope. Wire never omits fields
 *  even on failure — server sets tools=[] and ok=false + error.code. */
export interface McpProbeResponse {
  ok: boolean
  tools: McpTool[]
  error?: { code?: string; message?: string }
}

/** Run an MCP handshake against the server described by `req` and return
 *  its tool list. The response is HTTP 200 even on probe failure — the
 *  `ok` flag tells the caller whether tools[] is meaningful. */
export async function probeSystemMcp(
  req: McpProbeRequest,
): Promise<McpProbeResponse> {
  const resp = await mcpApi.post<McpProbeResponse>('/admin/mcps/probe', req)
  return resp.data
}

// ─── Icon upload (presigned URL flow) ────────────────────────────────────

/** POST /admin/api/v1/mcps/upload/icon response. Mirrors
 *  service.parse.IconUploadResult in the marketplace. `download_url` is the
 *  persistent public URL that callers store on the MCP record after
 *  successfully PUTting the bytes to `presigned_url`. */
export interface McpIconInitResponse {
  object_key: string
  presigned_url: string
  expires_in: number
  method: string
  headers: Record<string, string>
  download_url: string
}

/** Two-step icon upload: hit marketplace for a presigned PUT URL, then
 *  PUT the file bytes directly to that URL, then hand back the persistent
 *  download URL to store on the MCP record. Marketplace-side handler is
 *  `POST /api/v1/admin/mcps/upload/icon` (added in
 *  handler/mcp_icon.go); admin auth flows through WrapMarketAdmin — the
 *  operator's Octo login token + role=superAdmin — same as every other
 *  mcpApi call. */
export async function uploadMcpIcon(file: File): Promise<string> {
  const initResp = await mcpApi.post<McpIconInitResponse>(
    '/admin/mcps/upload/icon',
    {
      file_name: file.name,
      file_size: file.size,
      content_type: file.type,
    },
  )
  const { presigned_url, download_url, headers } = initResp.data
  // Direct PUT to the presigned URL. Use fetch instead of mcpApi (axios)
  // because the presigned URL points at the local proxy or OSS host — not
  // the admin base URL, and we don't want mcpApi's token / Accept-Language
  // interceptors leaking into a third-party call.
  const putResp = await fetch(presigned_url, {
    method: 'PUT',
    headers: headers ?? {},
    body: file,
  })
  if (!putResp.ok) {
    throw new Error(`Upload failed (${putResp.status})`)
  }
  return download_url
}
