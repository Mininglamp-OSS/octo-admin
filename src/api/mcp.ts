/**
 * octo-marketplace admin client for MCP resources.
 *
 * Uses the shared marketplace axios instance from ./marketplace, which
 * handles baseURL, auth token injection, Accept-Language, and error-envelope
 * normalization. Marketplace admits only role=superAdmin on the /admin/*
 * namespace (mcp-v1.md §9.1); this file trusts that gate and only adds
 * resource-specific types + endpoint wrappers.
 *
 * Wire contract: marketplace wraps every success payload as `{data: T}` and
 * every field is snake_case. Types in this file mirror the wire exactly —
 * page code reads snake_case directly. Same pattern as ./skill.ts.
 */

import { marketplaceApi as mcpApi, putPresignedFile } from './marketplace'

// ─── Types (mirrors octo-marketplace/docs/api/mcp-v1.md §3, wire shape) ────

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
  server_name: string
  /** ASCII identifier used as the JSON key in the generated mcpServers
   *  snippet (mcp-v1.md §3, "服务标识"). Present on records created after
   *  migration 03; matches `^[a-z0-9-]{1,64}$`. Empty on legacy rows. */
  slug?: string
  url?: string
  auth_type?: McpAuthType
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
}

/** List projection returned by GET /admin/api/v1/mcps (doc §3.2 superset). */
export interface McpListItem {
  mcp_id: string
  name: string
  slogan: string
  category: string
  icon: string
  tags: string[]
  tool_count: number
  visibility: McpVisibility
  creator_name: string
  created_by_type?: string
}

/** Full record returned by POST/GET/PATCH /admin/api/v1/mcps (doc §3.1). */
export interface McpDetail extends McpListItem {
  quick_start: McpQuickStart
  tools: McpTool[]
  usage_examples: string[]
  faqs: McpFaq[]
  notes: string[]
  created_at: string
  updated_at: string
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
  auth_type?: McpAuthType
  tools: McpTool[]
  usage_examples?: string[]
  faqs?: McpFaq[]
  notes?: string[]
}

export interface ListMcpParams {
  keyword?: string
  category?: string
  limit?: number
  offset?: number
}

/** Client-side projection of `GET /admin/mcps` wire response. Wire ships
 *  `{data: McpListItem[], pagination: {total, page, page_size}}` — we
 *  flatten to `{items, total}` for the page. */
export interface ListMcpResponse {
  items: McpListItem[]
  total: number
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
  auth_type?: McpAuthType
  tools?: McpTool[]
  usage_examples?: string[]
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
  const resp = await mcpApi.get<{
    data: McpListItem[]
    pagination: { total: number; page: number; page_size: number }
  }>('/admin/mcps', { params: query })
  return {
    items: resp.data.data ?? [],
    total: resp.data.pagination?.total ?? 0,
  }
}

/** POST /admin/api/v1/mcps — create a system MCP. */
export async function createSystemMcp(
  params: CreateMcpParams
): Promise<McpDetail> {
  const resp = await mcpApi.post<{ data: McpDetail }>('/admin/mcps', params)
  return resp.data.data
}

/** GET /admin/api/v1/mcps/{id} — fetch full detail for a system MCP. */
export async function getSystemMcp(id: string): Promise<McpDetail> {
  const resp = await mcpApi.get<{ data: McpDetail }>(
    `/admin/mcps/${encodeURIComponent(id)}`
  )
  return resp.data.data
}

/** PATCH /admin/api/v1/mcps/{id} — partial update. Any admin can edit any
 *  system MCP (no ownership check server-side). */
export async function updateSystemMcp(
  id: string,
  params: PatchMcpParams
): Promise<McpDetail> {
  const resp = await mcpApi.patch<{ data: McpDetail }>(
    `/admin/mcps/${encodeURIComponent(id)}`,
    params
  )
  return resp.data.data
}

/** DELETE /admin/api/v1/mcps/{id} — soft delete. */
export async function deleteSystemMcp(id: string): Promise<void> {
  await mcpApi.delete(`/admin/mcps/${encodeURIComponent(id)}`)
}

// ─── Probe ────────────────────────────────────────────────────────────────

/** POST /admin/api/v1/mcps/probe body. Mirrors service.ProbeRequest exactly
 *  — the marketplace decodes with DisallowUnknownFields, so any extra field
 *  is rejected as "request body is not valid JSON". A Bearer token, when
 *  set, lives inside `headers.Authorization` and reaches the remote MCP
 *  through that path. Only remote transports (streamable-http / sse) are
 *  probable — stdio needs a desktop runtime. */
export interface McpProbeRequest {
  transport: McpTransport
  url?: string
  headers?: Record<string, string>
}

/** POST /admin/api/v1/mcps/probe response envelope. Wire never omits fields
 *  even on failure — server sets tools=[] and is_ok=false + error.code. */
export interface McpProbeResponse {
  is_ok: boolean
  tools: McpTool[]
  error?: { code?: string; message?: string }
}

/** Run an MCP handshake against the server described by `req` and return
 *  its tool list. The response is HTTP 200 even on probe failure — the
 *  `is_ok` flag tells the caller whether tools[] is meaningful. */
export async function probeSystemMcp(
  req: McpProbeRequest,
): Promise<McpProbeResponse> {
  const resp = await mcpApi.post<{ data: McpProbeResponse }>(
    '/admin/mcps/probe',
    req
  )
  return resp.data.data
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
  const initResp = await mcpApi.post<{ data: McpIconInitResponse }>(
    '/admin/mcps/upload/icon',
    {
      file_name: file.name,
      file_size: file.size,
      content_type: file.type,
    },
  )
  const { presigned_url, download_url, method, headers } = initResp.data.data
  await putPresignedFile(presigned_url, file, { method, headers })
  return download_url
}
