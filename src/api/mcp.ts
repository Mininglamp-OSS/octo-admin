/**
 * octo-marketplace admin client for MCP resources.
 *
 * Uses the shared marketplace axios instance from ./marketplace, which
 * handles baseURL, auth token injection, Accept-Language, and error-envelope
 * normalization. Marketplace admits only role=superAdmin on the /admin/*
 * namespace (mcp-v1.md §9.1); this file trusts that gate and only adds
 * resource-specific types + endpoint wrappers.
 *
 * The MCP catalog CRUD now targets octo-marketplace's UNIFIED plugin surface
 * (`/admin/plugins*`, plugin_type=connector). The flat snake_case
 * McpDetail/CreateMcpParams shapes the SystemMcp pages consume are mapped to
 * and from the plugin wire model (manifest_json display document + plugin_json
 * connector package of mcp.json + connector/* attachments) in the translation
 * layer below, so the consuming pages need no change. `probe` and icon upload
 * are tooling endpoints outside the catalog CRUD; they target the current
 * `/admin/mcps/_probe` and `/admin/mcp_icon_uploads` routes (the pre-migration
 * `/admin/mcps/probe` and `/admin/mcps/upload/icon` aliases are deprecated with
 * a 2026-10-01 sunset).
 */

import { marketplaceApi as mcpApi, putPresignedFile } from './marketplace'
import { ApiError } from './index'

// ─── Types (mirrors octo-marketplace/docs/api/mcp-v1.md §3, wire shape) ────

export type McpVisibility = 'system' | 'space' | 'private'
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
  /** Stored mcpServers JSON key for the modeled server — the VERBATIM key the
   *  backend persisted (mcp-v1.md §3, "服务标识"). May differ from the slug for
   *  a backend-minted connector; threaded back on write so the key round-trips
   *  (review B). Empty when the record carries no mcp.json server. */
  server_name: string
  /** Extra mcpServers entries this form does not model, retained verbatim from
   *  read so a multi-server document round-trips without dropping servers on
   *  write (review C safeguard). Absent/empty for the common single-server
   *  connector. */
  extra_servers?: Record<string, McpServerEntryWire>
  /** The RAW stored modeled-server object (the mcpServers[serverKey] entry) as
   *  it arrived on the wire, carried through read→edit→write so keys this form
   *  does not model (cwd, timeout, disabled, a mis-defaulted remote url, …)
   *  survive a metadata edit instead of being rebuilt away. The write seeds the
   *  server from this and overlays the modeled form fields on top. */
  raw_server?: Record<string, unknown>
  /** ASCII identifier used as the JSON key in the generated mcpServers
   *  snippet (mcp-v1.md §3, "服务标识"). Present on records created after
   *  migration 03; matches `^[a-z0-9-]{1,64}$`. Empty on legacy rows. */
  slug?: string
  url?: string
  auth_type?: McpAuthType
  headers?: Record<string, string>
  /** Header keys whose value each consumer must fill locally (mcp-v1.md §5.1
   *  "toggle model"). The wire persists such keys with an empty value; the
   *  copy-paste snippet renders a placeholder in their slot. Absent / empty
   *  → every header is a shared value the author published verbatim. */
  headers_user_supplied?: string[]
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Env keys whose value each consumer must fill locally. Same wire
   *  contract as headers_user_supplied. */
  env_user_supplied?: string[]
}

/** List projection returned by GET /admin/api/v1/mcps (doc §3.2 superset). */
export interface McpListItem {
  mcp_id: string
  name: string
  slogan: string
  category: string
  /** Canonical, write-round-trip icon value the backend stores and clients
   *  echo on update: an object key, an emoji, or a full URL. NEVER overwrite
   *  this with `icon_url` — a stored object key resolves to a 1-hour presigned
   *  `icon_url` that would 403 once written back into the canonical column. */
  icon: string
  /** Resolved display URL (a 1-hour presigned URL when `icon` is an object
   *  key; otherwise the value handed straight back). Use for rendering only;
   *  never send it back as `icon`. */
  icon_url: string
  /** Backfilled publisher/owner display name. Carried through read→edit→write
   *  so a metadata PATCH doesn't blank it (the backend stamps it
   *  unconditionally from the request). */
  publisher?: string
  tags: string[]
  tool_count: number
  visibility: McpVisibility
  /** Raw unified-plugin visibility (`system`/`space`/`private`) as it
   *  arrives on the wire, before `mapVisibility` collapses it. Drives the
   *  admin list "可见范围" column. */
  scope: string
  /** Owning Space id (empty for public/system). Drives the admin list "所属空间"
   *  column, which resolves it to a Space name. */
  space_id?: string
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
  /** Stored mcpServers JSON key to preserve verbatim on write. When present the
   *  connector upsert keys the server map by THIS instead of re-slugifying the
   *  display name, so a backend-minted key that differs from the slug round-trips
   *  byte-for-byte (review B). Omitted on a fresh create → the slug is used. */
  server_name?: string
  /** Extra mcpServers entries to re-emit verbatim alongside the modeled server
   *  (review C safeguard). Threaded straight through from read. */
  extra_servers?: Record<string, McpServerEntryWire>
  /** Raw stored modeled-server object, seeded into the write so unmodeled keys
   *  (cwd/timeout/disabled/…) survive. Threaded straight through from read. */
  raw_server?: Record<string, unknown>
  category: string
  icon?: string
  /** Existing publisher, echoed on update so the backend doesn't blank it.
   *  Omitted on create — the backend stamps it from the authenticated
   *  operator. */
  publisher?: string
  tags?: string[]
  slogan?: string
  transport: McpTransport
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Env keys whose value each consumer fills locally (mcp-v1.md §5.1). */
  env_user_supplied?: string[]
  headers?: Record<string, string>
  /** Header keys whose value each consumer fills locally. */
  headers_user_supplied?: string[]
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

/** Client-side projection of the list wire response. The unified surface ships
 *  `{data: PluginListItem[], pagination: {total, page, page_size}}` — we
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
  /** See CreateMcpParams.server_name — stored key preserved verbatim on write. */
  server_name?: string
  /** See CreateMcpParams.extra_servers — extra servers re-emitted verbatim. */
  extra_servers?: Record<string, McpServerEntryWire>
  /** See CreateMcpParams.raw_server — seeds the write so unmodeled keys survive. */
  raw_server?: Record<string, unknown>
  category?: string
  icon?: string
  /** Existing publisher, echoed on update so the backend doesn't blank it. */
  publisher?: string
  tags?: string[]
  slogan?: string
  transport?: McpTransport
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  env_user_supplied?: string[]
  headers?: Record<string, string>
  headers_user_supplied?: string[]
  auth_type?: McpAuthType
  tools?: McpTool[]
  usage_examples?: string[]
  faqs?: McpFaq[]
  notes?: string[]
}

// ─── Unified plugin translation layer (internal) ───────────────────────────
//
// The MCP catalog lives on octo-marketplace's UNIFIED plugin surface
// (`/admin/plugins*`, plugin_type=connector). The flat McpDetail/CreateMcpParams
// shapes the pages use are reshaped here into the plugin wire model
// (manifest_json display document + plugin_json package of a root mcp.json +
// connector/* attachments) and back, so the consuming pages need no change. The
// connector package layout mirrors octo-marketplace's own backfill
// (internal/backfill/plugin/{connector,mapping}.go) so a record this client
// writes is byte-shaped like one the backend mints.

const AUTHORIZATION_HEADER_KEY = 'Authorization'

/** `${KEY}` install-time placeholder for a user-supplied env/header value —
 *  the marketplace connector contract stores a user-supplied key with this
 *  marker in mcp.json rather than a real value (backfill connector.go
 *  placeholderFor). On read it maps back to a user_supplied key with an empty
 *  value slot. */
const PLACEHOLDER_PATTERN = /^\$\{[A-Za-z0-9_]+\}$/

interface PluginManifestExampleWire {
  title: string
  input: string
}

interface PluginManifestWire {
  $schema?: string
  plugin_name?: string
  plugin_type?: string
  /** Machine name — for connectors this carries the legacy slug. */
  name?: string
  description?: string
  labels?: string[]
  examples?: PluginManifestExampleWire[]
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
  connector?: { type?: string; source?: string }
  attachments?: PluginAttachmentWire[]
}

interface PluginListItemWire {
  plugin_id: string
  plugin_name: string
  plugin_type: string
  manifest_json?: PluginManifestWire
  /** May arrive as a JSON-encoded string on the unified wire — always run it
   *  through `normalizeTagsList` before use. */
  tags?: unknown
  category_id?: string
  icon?: string
  icon_url?: string
  tool_count?: number
  publisher?: string
  owner_id?: string
  space_id?: string
  visibility?: string
  creator_name?: string
  created_by_type?: string
  current_version?: string
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

interface ConnectorCategoryMaps {
  keyToId: Map<string, string>
  idToKey: Map<string, string>
  wire: PluginCategoryWire[]
}

/** GET /admin/plugin_categories?plugin_type=connector. The category NAME is the
 *  legacy enum key (dev/data/…), so both directions are pure lookups. */
async function fetchConnectorCategoryMaps(): Promise<ConnectorCategoryMaps> {
  const resp = await mcpApi.get<{ data: PluginCategoryWire[] }>(
    '/admin/plugin_categories',
    { params: { plugin_type: 'connector' } }
  )
  const wire = resp.data.data ?? []
  const keyToId = new Map<string, string>()
  const idToKey = new Map<string, string>()
  for (const c of wire) {
    keyToId.set(c.name, c.category_id)
    idToKey.set(c.category_id, c.name)
  }
  return { keyToId, idToKey, wire }
}

/** Resolve a connector category NAME to its unified id. A NON-EMPTY name that
 *  doesn't resolve is a hard error (LOUD) rather than a silent omission: on the
 *  full-replace PATCH an omitted category_id writes NULL, so a category created
 *  in the new tab (or a renamed seeded one) that isn't in the map would silently
 *  un-categorize the connector on every create/edit. An empty name is a genuine
 *  "uncategorized" and resolves to undefined. */
function resolveConnectorCategoryId(
  maps: ConnectorCategoryMaps,
  category: string | undefined
): string | undefined {
  const name = category?.trim()
  if (!name) return undefined
  const id = maps.keyToId.get(name)
  if (!id) {
    throw new ApiError(
      `Unknown connector category: ${name}`,
      400,
      'category_not_found'
    )
  }
  return id
}

/** raw_content of one inline package attachment, or undefined. */
function rawAttachment(
  pkg: PluginPackageWire | undefined,
  path: string
): string | undefined {
  const hit = (pkg?.attachments ?? []).find(
    (a) => a.path === path && a.content_type === 'raw'
  )
  return hit?.raw_content
}

/** Parsed JSON body of one inline attachment; undefined on miss/parse error. */
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

/** Stable serializer matching Go's json.Marshal encoding (sorted keys,
 *  `<>&`/U+2028/U+2029 escapes). The connector attachment raw_content must
 *  byte-match what the backend would emit. */
function goCanonicalJSON(value: unknown): string {
  return escapeLikeGo(stringifySortedKeys(value))
}

function stringifySortedKeys(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stringifySortedKeys).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
  const parts = keys.map(
    (key) => `${JSON.stringify(key)}:${stringifySortedKeys(record[key])}`
  )
  return `{${parts.join(',')}}`
}

function escapeLikeGo(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/\\./g, (escape) => {
      if (escape === '\\b') return '\\u0008'
      if (escape === '\\f') return '\\u000c'
      return escape
    })
}

/** Safe fallback slug when a name slugifies to the empty string (all
 *  non-ASCII, e.g. a pure-Chinese name). A `mcpServers` JSON key must be a
 *  stable ASCII identifier, so we never emit an empty key. Mirrors octo-web's
 *  `DEFAULT_SERVER_SLUG` (packages/dmworkmcp/src/utils/constants.ts). */
export const DEFAULT_SERVER_SLUG = 'mcp-server'

/** Slugify a server name byte-for-byte the way octo-web's `slugifyServerName`
 *  does (packages/dmworkmcp/src/utils/constants.ts), so an identical name
 *  yields an identical slug across the two consoles:
 *    - trim, lowercase
 *    - runs of WHITESPACE → `-` (underscores are NOT hyphenated; they fall
 *      through to the strip step below and are dropped)
 *    - drop every char outside [a-z0-9-]
 *    - collapse repeated / edge hyphens
 *    - fall back to DEFAULT_SERVER_SLUG when the result is empty
 *  Note: octo-web applies no length cap here, so neither do we. */
export function slugifyServerName(input: string): string {
  const slug = (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || DEFAULT_SERVER_SLUG
}

/** Normalize a key into the ${KEY} placeholder name (Authorization ->
 *  AUTHORIZATION, X-API-Key -> X_API_KEY), mirroring backfill connector.go
 *  envPlaceholderName so a fresh write matches a backend-minted record. */
function envPlaceholderName(key: string): string {
  let out = ''
  for (const ch of key.trim()) {
    if (ch >= 'a' && ch <= 'z') out += ch.toUpperCase()
    else if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) out += ch
    else out += '_'
  }
  return out || 'VALUE'
}

function placeholderFor(key: string): string {
  return '${' + envPlaceholderName(key) + '}'
}

/** Write side: fold a flat (values map + user_supplied[]) pair into the single
 *  mcp.json env/headers map the connector contract stores: shared keys carry
 *  their verbatim value, user-supplied keys carry a ${KEY} placeholder. */
function valueMapWithPlaceholders(
  values: Record<string, string> | undefined,
  userSupplied: string[] | undefined
): Record<string, string> | undefined {
  const supplied = new Set((userSupplied ?? []).map((k) => k.trim()).filter(Boolean))
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values ?? {})) {
    const k = key.trim()
    if (!k) continue
    out[k] = supplied.has(k) ? placeholderFor(k) : value
  }
  // A user-supplied key the values map omitted still needs a placeholder slot.
  for (const key of supplied) {
    if (!(key in out)) out[key] = placeholderFor(key)
  }
  return Object.keys(out).length ? out : undefined
}

/** Read side: split a stored mcp.json env/headers map back into the
 *  (values, user_supplied) pair the form drives. A ${KEY} placeholder (the
 *  connector marker for a consumer-filled value) maps to a user_supplied key
 *  with a blank value slot; every other key is a shared value passed verbatim. */
function splitPlaceholders(
  map: Record<string, string> | undefined
): { values?: Record<string, string>; userSupplied?: string[] } {
  if (!map || !Object.keys(map).length) return {}
  const values: Record<string, string> = {}
  const userSupplied: string[] = []
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === 'string' && PLACEHOLDER_PATTERN.test(value)) {
      values[key] = ''
      userSupplied.push(key)
    } else {
      values[key] = value
    }
  }
  return {
    values,
    userSupplied: userSupplied.length ? userSupplied : undefined,
  }
}

/** Unified plugin visibility → McpVisibility. The wire now emits only
 *  `system` | `space` | `private`; legacy `public` was folded into `system` by
 *  the backend migration, and any unknown value defaults to the global scope. */
function mapVisibility(v: string | undefined): McpVisibility {
  if (v === 'space') return 'space'
  if (v === 'private') return 'private'
  return 'system'
}

/** Safely coerce a wire `tags` value to string[]. The unified plugin list can
 *  return tags as a JSON-encoded string; mirror the skill/expert mappers so a
 *  string-encoded value never reaches the page as a bare String (whose missing
 *  `.map` would crash the tag column). */
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

function mapMcpListItem(
  raw: PluginListItemWire,
  idToKey: Map<string, string>
): McpListItem {
  const manifest = raw.manifest_json ?? {}
  return {
    mcp_id: raw.plugin_id,
    name: raw.plugin_name ?? '',
    slogan: manifest.description ?? '',
    category: (raw.category_id && idToKey.get(raw.category_id)) || '',
    // `icon` is the canonical write value; `icon_url` is the resolved display
    // URL (presigned when icon is an object key). Keep them SEPARATE — folding
    // icon_url into icon would store the 1h presigned URL back on the next edit
    // and 403 the icon an hour later.
    icon: raw.icon ?? '',
    icon_url: raw.icon_url || raw.icon || '',
    publisher: raw.publisher || '',
    // The unified wire can deliver tags as a JSON-encoded string; normalize so
    // the page's `tags.slice(0,3).map(...)` never hits a bare String (crash).
    tags: normalizeTagsList(raw.tags),
    tool_count: raw.tool_count ?? 0,
    visibility: mapVisibility(raw.visibility),
    scope: raw.visibility ?? 'system',
    space_id: raw.space_id,
    creator_name: raw.creator_name ?? '',
    created_by_type: raw.created_by_type,
  }
}

/** One mcpServers entry inside the root mcp.json attachment. Exported so the
 *  form can carry preserved (modeled + extra) server entries verbatim. */
export interface McpServerEntryWire {
  type?: McpTransport
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
}

interface McpJSONWire {
  mcpServers?: Record<string, McpServerEntryWire>
}

function mapMcpDetail(
  raw: PluginDetailPluginWire,
  idToKey: Map<string, string>
): McpDetail {
  const item = mapMcpListItem(raw, idToKey)
  const manifest = raw.manifest_json ?? {}
  const pkg = raw.plugin_json
  const servers =
    jsonAttachment<McpJSONWire>(pkg, 'mcp.json')?.mcpServers ?? {}
  // One connector = one MODELED MCP server. Select the entry this record
  // actually names — the manifest machine name (a.k.a. quick_start.slug) or the
  // connector source (`connector.<name>`) — rather than the first-sorted key,
  // so a multi-server document models the correct server. Fall back to the
  // first key only when neither name resolves to a present entry. Any OTHER
  // entries are retained aside and re-emitted verbatim on write so an
  // unexpected multi-server document is never silently collapsed (review C).
  const serverKeys = Object.keys(servers)
  const connectorSource = pkg?.connector?.source
  const sourceName =
    connectorSource && connectorSource.startsWith('connector.')
      ? connectorSource.slice('connector.'.length)
      : undefined
  // Select the modeled server: prefer the one named by connector.source (which
  // the write path anchors to the real map key), then manifest.name (the slug —
  // only a present key when it happens to equal the server key), then the first
  // key. Source-first avoids flipping the modeled server when an extra server is
  // keyed like the slug (review P1).
  const namedKey =
    (sourceName && servers[sourceName] ? sourceName : undefined) ??
    (manifest.name && servers[manifest.name] ? manifest.name : undefined)
  const serverName = namedKey ?? serverKeys[0] ?? ''
  const server = servers[serverName] ?? {}
  const extraServers: Record<string, McpServerEntryWire> = {}
  for (const k of serverKeys) {
    if (k !== serverName) extraServers[k] = servers[k]
  }
  const env = splitPlaceholders(server.env)
  const headers = splitPlaceholders(server.headers)
  const hasAuth = !!server.headers && AUTHORIZATION_HEADER_KEY in server.headers
  const tools =
    jsonAttachment<McpTool[]>(pkg, 'connector/tools.json') ?? []
  return {
    ...item,
    // Detail is the authoritative tool source; the list projection uses the
    // stored tool_count.
    tool_count: tools.length || item.tool_count,
    quick_start: {
      transport: server.type ?? 'stdio',
      // Expose the VERBATIM stored key so the form can thread it back on write
      // (review B). Empty when the record carries no mcp.json server.
      server_name: serverName,
      extra_servers: Object.keys(extraServers).length ? extraServers : undefined,
      // Carry the RAW modeled-server object so the write can seed from it and
      // preserve keys this form doesn't model (cwd/timeout/disabled/url).
      raw_server: server as Record<string, unknown>,
      // The manifest machine name carries the legacy slug for connectors.
      slug: manifest.name,
      url: server.url,
      // The unified wire stores no auth_type; derive it from the presence of
      // an Authorization header (mcp-v1.md §5.1 invariant).
      auth_type: hasAuth ? 'bearer' : 'none',
      command: server.command,
      args: server.args,
      env: env.values,
      env_user_supplied: env.userSupplied,
      headers: headers.values,
      headers_user_supplied: headers.userSupplied,
    },
    tools,
    usage_examples:
      jsonAttachment<string[]>(raw.plugin_json, 'connector/examples.json') ?? [],
    faqs: jsonAttachment<McpFaq[]>(raw.plugin_json, 'connector/faqs.json') ?? [],
    notes: jsonAttachment<string[]>(raw.plugin_json, 'connector/notes.json') ?? [],
    created_at: raw.created_at ?? '',
    updated_at: raw.updated_at ?? '',
  }
}

interface ConnectorAttachmentBody {
  path: string
  content_type: 'raw'
  mime_type: string
  raw_content: string
}

interface ConnectorUpsertBody {
  plugin: {
    plugin_id?: string
    plugin_name: string
    plugin_type: 'connector'
    category_id?: string
    tags: string[]
    icon: string
    publisher?: string
    visibility: McpVisibility
    manifest_json: PluginManifestWire
    plugin_json: {
      $schema: string
      connector: { type: 'mcp'; source: string }
      attachments: ConnectorAttachmentBody[]
    }
  }
  relations: []
}

function rawAtt(path: string, content: string): ConnectorAttachmentBody {
  return {
    path,
    content_type: 'raw',
    mime_type: 'application/json',
    raw_content: content,
  }
}

/** Reshape the flat MCP create/patch payload into the connector plugin upsert
 *  body (manifest_json display document + plugin_json connector package). */
function toConnectorUpsert(
  params: CreateMcpParams | PatchMcpParams,
  opts: { pluginId?: string; categoryId?: string; visibility: McpVisibility }
): ConnectorUpsertBody {
  const name = (params.name ?? '').trim()
  const slug = slugifyServerName(params.slug?.trim() ? params.slug : name)
  // slugifyServerName never returns empty (it falls back to DEFAULT_SERVER_SLUG),
  // so `key` is always a stable ASCII identifier.
  const key = slug
  // The mcpServers map key is the stored server name when the record carries
  // one (preserved verbatim so a backend-minted key that differs from the slug
  // round-trips — review B), falling back to the slug for a fresh create.
  // connector.source anchors to THIS key (mapKey) so it always names the
  // modeled server; manifest.name stays the SLUG (the connector's machine
  // name), which the read side no longer relies on for server selection.
  const mapKey = params.server_name?.trim() || key
  // Pre-normalize like the backend (trim, drop empties, dedupe) so
  // manifest_json.labels matches the tags column invariant (tags == labels).
  const tags = [
    ...new Set((params.tags ?? []).map((t) => t.trim()).filter(Boolean)),
  ]
  const usage = (params.usage_examples ?? []).map((s) => s.trim()).filter(Boolean)
  const manifest: PluginManifestWire = {
    $schema: 'cowork-plugin-manifest-2.0.json',
    plugin_name: name,
    plugin_type: 'connector',
    // The manifest machine name is the connector's SLUG (its stable identity),
    // NOT the mcpServers key. Anchoring it to the server key would hijack a
    // backend-minted connector's machine name (e.g. "GitHub MCP") away from its
    // slug ("github-mcp") on a no-op save (review P1). The read side selects the
    // modeled server via connector.source (which IS anchored to mapKey), so
    // manifest.name never needs to be a present map key.
    name: key,
    description: params.slogan ?? '',
    labels: tags,
    examples: usage.map((input, i) => ({ title: `使用示例 ${i + 1}`, input })),
  }
  // Seed from the RAW stored modeled-server object so keys this form does not
  // model (cwd, timeout, disabled, …) survive a metadata edit. But every key the
  // form DOES model must come from the current form only — otherwise clearing a
  // field (deleting all env/headers, clearing args, flipping transport) would
  // leave the stale seeded value behind (a removed credential would silently
  // persist). So drop the modeled keys from the seed, then overlay the form.
  const server: Record<string, unknown> = { ...(params.raw_server ?? {}) }
  for (const k of ['type', 'url', 'command', 'args', 'env', 'headers']) {
    delete server[k]
  }
  if (params.transport) server.type = params.transport
  if (params.url) server.url = params.url
  if (params.command) server.command = params.command
  if (params.args?.length) server.args = params.args
  const env = valueMapWithPlaceholders(params.env, params.env_user_supplied)
  if (env) server.env = env
  const headers = valueMapWithPlaceholders(
    params.headers,
    params.headers_user_supplied
  )
  // A legacy bearer auth_type folds into an Authorization header placeholder
  // (backfill connector.go), so the derived read-side auth_type round-trips.
  if (
    params.auth_type === 'bearer' &&
    !(headers && AUTHORIZATION_HEADER_KEY in headers)
  ) {
    const withAuth = { ...(headers ?? {}) }
    withAuth[AUTHORIZATION_HEADER_KEY] = placeholderFor(AUTHORIZATION_HEADER_KEY)
    server.headers = withAuth
  } else if (headers) {
    server.headers = headers
  }
  // Key the modeled server by its preserved stored key (mapKey), then re-emit
  // any extra servers the form doesn't model VERBATIM so a multi-server
  // document is never collapsed on write (review C). goCanonicalJSON sorts
  // keys, so insertion order does not affect the emitted bytes.
  const mcpServers: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params.extra_servers ?? {})) {
    if (k !== mapKey) mcpServers[k] = v
  }
  mcpServers[mapKey] = server
  const attachments: ConnectorAttachmentBody[] = [
    rawAtt('mcp.json', goCanonicalJSON({ mcpServers })),
    rawAtt('connector/tools.json', goCanonicalJSON(params.tools ?? [])),
    rawAtt('connector/examples.json', goCanonicalJSON(usage)),
    rawAtt(
      'connector/faqs.json',
      goCanonicalJSON((params.faqs ?? []).filter((f) => f.question.trim()))
    ),
    rawAtt(
      'connector/notes.json',
      goCanonicalJSON((params.notes ?? []).map((s) => s.trim()).filter(Boolean))
    ),
  ]
  return {
    plugin: {
      ...(opts.pluginId ? { plugin_id: opts.pluginId } : {}),
      plugin_name: name,
      plugin_type: 'connector',
      ...(opts.categoryId ? { category_id: opts.categoryId } : {}),
      tags,
      // Canonical icon only. The form seeds this from the record's canonical
      // `icon` (object key / emoji / URL), NOT the presigned `icon_url`, so an
      // untouched icon round-trips its stored key and a fresh upload replaces
      // it. An empty string is a genuine "no icon".
      icon: params.icon ?? '',
      // Echo the existing publisher on update so the backend's unconditional
      // stamp doesn't blank it. Omitted on create (backend stamps the operator).
      ...(params.publisher ? { publisher: params.publisher } : {}),
      visibility: opts.visibility,
      manifest_json: manifest,
      plugin_json: {
        $schema: 'cowork-plugin-package-2.0.json',
        // connector.source anchors to the modeled server's map key (mapKey), the
        // same identifier used for manifest.name and the mcpServers key, so the
        // three never disagree (review P1-A).
        connector: { type: 'mcp', source: `connector.${mapKey}` },
        attachments,
      },
    },
    relations: [],
  }
}

/** GET /admin/plugins/{id}?include_relations=true → mapped McpDetail. */
async function loadMcpDetail(id: string): Promise<McpDetail> {
  const maps = await fetchConnectorCategoryMaps()
  const resp = await mcpApi.get<{
    data: { plugin: PluginDetailPluginWire; relations: unknown[] }
  }>(`/admin/plugins/${encodeURIComponent(id)}`, {
    params: { include_relations: true },
  })
  return mapMcpDetail(resp.data.data.plugin, maps.idToKey)
}

/** Best-effort plugin_id extraction from a create/patch echo, tolerating both
 *  `{plugin:{plugin_id}}` and a bare `{plugin_id}` envelope. Throws a clean
 *  create-failed error on an empty id so a malformed echo surfaces here rather
 *  than as a deep TypeError when `loadMcpDetail('')` fetches a bogus row. */
export function extractPluginId(data: unknown): string {
  const d = data as {
    plugin?: { plugin_id?: string }
    plugin_id?: string
  } | null
  const id = d?.plugin?.plugin_id ?? d?.plugin_id ?? ''
  if (!id) {
    throw new ApiError(
      'Create failed: server did not return a plugin id',
      502,
      'invalid_response'
    )
  }
  return id
}

// ─── Public functions ─────────────────────────────────────────────────────

/** GET /admin/plugins?plugin_type=connector — list connector plugins
 *  (the unified home of the legacy system MCP catalog). */
export async function listSystemMcps(
  params: ListMcpParams = {}
): Promise<ListMcpResponse> {
  const maps = await fetchConnectorCategoryMaps()
  const query: Record<string, unknown> = { plugin_type: 'connector' }
  const keyword = params.keyword?.trim()
  if (keyword) query.q = keyword
  const categoryKey = params.category
  if (categoryKey && categoryKey !== 'all') {
    const categoryId = maps.keyToId.get(categoryKey)
    if (categoryId) query.category_id = categoryId
  }
  // The unified list endpoint pages by number (page/page_size), not
  // limit/offset — same translation as ./skill.ts.
  const pageSize = params.limit && params.limit > 0 ? params.limit : 20
  query.page_size = pageSize
  query.page =
    params.offset && params.offset > 0
      ? Math.floor(params.offset / pageSize) + 1
      : 1
  const resp = await mcpApi.get<{
    data: PluginListItemWire[]
    pagination: { total: number; page: number; page_size: number }
  }>('/admin/plugins', { params: query })
  return {
    items: (resp.data.data ?? []).map((raw) =>
      mapMcpListItem(raw, maps.idToKey)
    ),
    total: resp.data.pagination?.total ?? 0,
  }
}

/** POST /admin/plugins — create a connector plugin. Visibility is stamped
 *  `system` by convention (the server overrides regardless). */
export async function createSystemMcp(
  params: CreateMcpParams
): Promise<McpDetail> {
  const maps = await fetchConnectorCategoryMaps()
  const resp = await mcpApi.post<{ data: unknown }>(
    '/admin/plugins',
    toConnectorUpsert(params, {
      categoryId: resolveConnectorCategoryId(maps, params.category),
      visibility: 'system',
    })
  )
  const id = extractPluginId(resp.data.data)
  return loadMcpDetail(id)
}

/** GET /admin/plugins/{id} — fetch full detail for a connector plugin. */
export async function getSystemMcp(id: string): Promise<McpDetail> {
  return loadMcpDetail(id)
}

/** PATCH /admin/plugins/{id} — full-replace update. Echoes the row's EXISTING
 *  visibility rather than widening a space/private connector to system-wide.
 *  The server preserves visibility/space/owner on update, so this is
 *  belt-and-suspenders + parity with the skill edit path. */
export async function updateSystemMcp(
  id: string,
  params: PatchMcpParams
): Promise<McpDetail> {
  const maps = await fetchConnectorCategoryMaps()
  // Read the current row's visibility so an edit never hard-codes `system`.
  const current = await mcpApi.get<{
    data: { plugin: PluginDetailPluginWire; relations: unknown[] }
  }>(`/admin/plugins/${encodeURIComponent(id)}`)
  const visibility = mapVisibility(current.data.data.plugin.visibility)
  await mcpApi.patch(
    `/admin/plugins/${encodeURIComponent(id)}`,
    toConnectorUpsert(params, {
      pluginId: id,
      categoryId: resolveConnectorCategoryId(maps, params.category),
      visibility,
    })
  )
  return loadMcpDetail(id)
}

/** DELETE /admin/plugins/{id} — soft delete. */
export async function deleteSystemMcp(id: string): Promise<void> {
  await mcpApi.delete(`/admin/plugins/${encodeURIComponent(id)}`)
}

// ─── Categories (unified plugin surface) ────────────────────────────────────
//
// The 分类 tab under System MCP manages the connector catalog's categories, so
// it reads/writes the unified /admin/plugin_categories taxonomy filtered to
// plugin_type=connector. Each row carries plugin_types ["connector"]. Mirrors
// the expert-market category tab (see ./expert.ts).

/** Category row the System MCP 分类 tab renders. Mirrors ExpertCategory. */
export interface McpCategory {
  mcp_category_id: string
  name: string
  icon_key?: string
  sort_order: number
  count?: number
  /** The row's stored plugin_types, carried through read→edit→write so a rename
   *  from this (connector) tab echoes them back instead of NARROWING a category
   *  shared across plugin types to the connector-only set. Absent on legacy
   *  rows → the update falls back to the connector default. */
  plugin_types?: string[]
}

// plugin_types the MCP category tab manages — connector-only.
const MCP_CATEGORY_PLUGIN_TYPES = ['connector'] as const

/** Map a unified category wire row to the McpCategory the 分类 tab renders. */
function pluginCategoryToMcpCategory(c: PluginCategoryWire): McpCategory {
  return {
    mcp_category_id: c.category_id,
    name: c.name,
    icon_key: c.icon_key,
    sort_order: c.sort_order ?? 0,
    count: c.plugin_count,
    plugin_types: c.plugin_types,
  }
}

/** GET /admin/plugin_categories?plugin_type=connector → mapped category list. */
export async function listMcpCategories(): Promise<McpCategory[]> {
  const resp = await mcpApi.get<{ data: PluginCategoryWire[] }>(
    '/admin/plugin_categories',
    { params: { plugin_type: 'connector' } }
  )
  return (resp.data.data ?? []).map(pluginCategoryToMcpCategory)
}

/** POST /admin/plugin_categories — create a connector category. */
export async function createMcpCategory(params: {
  name: string
  icon_key?: string
  sort_order?: number
}): Promise<McpCategory> {
  const resp = await mcpApi.post<{ data: PluginCategoryWire }>(
    '/admin/plugin_categories',
    {
      name: params.name,
      icon_key: params.icon_key ?? '',
      plugin_types: MCP_CATEGORY_PLUGIN_TYPES,
      sort_order: params.sort_order ?? 0,
    }
  )
  return pluginCategoryToMcpCategory(resp.data.data)
}

/** PATCH /admin/plugin_categories/{id} — full-replace update. The backend
 *  overwrites all columns, so echo icon_key back on rename so it isn't wiped
 *  (mirrors updateExpertCategory). */
export async function updateMcpCategory(
  id: string,
  params: {
    name?: string
    icon_key?: string
    sort_order?: number
    plugin_types?: string[]
  }
): Promise<McpCategory> {
  const resp = await mcpApi.patch<{ data: PluginCategoryWire }>(
    `/admin/plugin_categories/${encodeURIComponent(id)}`,
    {
      name: params.name ?? '',
      icon_key: params.icon_key ?? '',
      // Echo the row's EXISTING plugin_types when the caller supplies them so a
      // rename from this connector tab never NARROWS a category that is shared
      // across plugin types down to ["connector"]. Legacy callers that omit them
      // fall back to the connector-only default.
      plugin_types: params.plugin_types?.length
        ? params.plugin_types
        : MCP_CATEGORY_PLUGIN_TYPES,
      sort_order: params.sort_order ?? 0,
    }
  )
  return pluginCategoryToMcpCategory(resp.data.data)
}

/** DELETE /admin/plugin_categories/{id} — 409 CONFLICT when still in use. */
export async function deleteMcpCategory(id: string): Promise<void> {
  await mcpApi.delete(`/admin/plugin_categories/${encodeURIComponent(id)}`)
}

// ─── Probe (/admin/mcps/_probe route) ──────────────────────────────────────

/** POST /admin/mcps/_probe body. Mirrors service.ProbeRequest exactly
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

/** POST /admin/mcps/_probe response envelope. Wire never omits fields
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
    '/admin/mcps/_probe',
    req
  )
  return resp.data.data
}

// ─── Icon upload (presigned URL flow, /admin/mcp_icon_uploads) ─────────────

/** POST /admin/mcp_icon_uploads response. Mirrors
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
 *  `POST /api/v1/admin/mcp_icon_uploads` (handler/mcp_icon.go; the legacy
 *  `/admin/mcps/upload/icon` alias is deprecated with a 2026-10-01 sunset);
 *  admin auth flows through WrapMarketAdmin — the operator's Octo login token
 *  + role=superAdmin — same as every other mcpApi call. */
export async function uploadMcpIcon(file: File): Promise<string> {
  const initResp = await mcpApi.post<{ data: McpIconInitResponse }>(
    '/admin/mcp_icon_uploads',
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
