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
 * add `pagination`) and every field is snake_case. The Expert/Squad list/get/
 * delete reads now target octo-marketplace's UNIFIED plugin surface
 * (`/admin/plugins*`, plugin_type=expert / expert_team). The flat snake_case
 * ExpertDetail/SquadDetail shapes the pages consume are mapped from the plugin
 * wire model (manifest_json display document + plugin_json package of AGENTS.md
 * / mcp.json + expert_skill / expert_team_expert relations) in the translation
 * layer below, so the consuming pages need no change. Same pattern as ./skill.ts
 * and ./mcp.ts.
 *
 * Creation model: the admin uploads the WHOLE container zip to the server-side
 * importer (`POST /admin/plugins/import`, multipart), which parses the container
 * and transactionally mints the expert/team plugin, its bundled skills as skill
 * plugins, and the relations wiring them (see importExpertContainer). The old
 * client-side unzip + per-skill presign + flat `/admin/experts` create path is
 * gone; parseContainer.ts is retained only for pre-upload preview/validation.
 *
 * Edit / re-upload is the same server-side container flow targeting an EXISTING
 * plugin: the admin re-uploads the WHOLE zip to
 * `POST /admin/plugins/container_reupload/{id}` (multipart), which rebuilds the
 * plugin in place — preserving plugin_id / visibility / Space / owner while
 * re-parsing the zip and swapping the embedded skills/members (see
 * reuploadExpertContainer / reuploadSquadContainer). The old client-side unzip +
 * per-skill presign + flat `/admin/experts` / `/admin/squads` PATCH path is gone.
 * SKILL.md preview is now derived client-side from the already-resolved skill
 * plugin's SKILL.md attachment (SkillRef.skill_md), so no supporting skill_md
 * endpoint is called. The ExpertMarket surface no longer calls any legacy
 * `/admin/experts|squads|expert_categories|expert_tags|expert_skill_uploads`
 * route — everything goes through `/admin/plugins*`.
 */

import { marketplaceApi as expertApi } from './marketplace'

// ─── Shared types (mirror octo-marketplace internal/model/expert_dto.go) ───

export type ExpertKind = 'agent' | 'squad'
export type ExpertVisibility = 'system' | 'space' | 'private'

/** Read projection of a skill on an expert/squad (never echoes bytes). */
export interface SkillRef {
  name: string
  has_content?: boolean
  can_download?: boolean
  file_name?: string
  file_size?: number
  files?: string[]
  /** Raw SKILL.md text of the source skill plugin, when present. Carried on the
   *  detail read (from the resolved skill plugin's SKILL.md attachment) so the
   *  SKILL.md viewer renders client-side with no extra network call. */
  skill_md?: string
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
  /** Raw unified-plugin visibility (`system`/`space`/`private`) as it
   *  arrives on the wire, before `mapVisibility` collapses it. Drives the
   *  admin list "可见范围" column so Space-scoped rows stay distinguishable. */
  scope: string
  /** Owning Space id (empty for public/system). Drives the admin list "所属空间"
   *  column, which resolves it to a Space name. */
  space_id?: string
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

export interface SquadListItem {
  squad_id: string
  short_name: string
  name: string
  summary: string
  category: string
  tags: string[]
  visibility: ExpertVisibility
  /** Raw unified-plugin visibility (see ExpertListItem.scope). */
  scope: string
  /** Owning Space id (see ExpertListItem.space_id). */
  space_id?: string
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

// ─── Categories / tags ──────────────────────────────────────────────────────

export interface ExpertCategory {
  expert_category_id: string
  name: string
  icon_key?: string
  sort_order: number
  count?: number
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

// ─── Unified plugin translation layer (internal) ───────────────────────────
//
// The Expert (plugin_type=expert) and Squad (plugin_type=expert_team) catalogs
// live on octo-marketplace's UNIFIED plugin surface (`/admin/plugins*`). The
// flat ExpertDetail/SquadDetail shapes the pages consume are reshaped here from
// the plugin wire model (manifest_json display document + plugin_json package of
// AGENTS.md / mcp.json + expert_skill / expert_team_expert relations), mirroring
// how install.go reconstructs the same graph server-side. Deriving a skill's
// name or a member's spec requires fetching the relation target plugin (the
// relation itself carries only ids + wiring), so detail loads fan out one GET
// per related skill/member — the same N+1 the server's install path walks.

type PluginTypeWire = 'expert' | 'expert_team'

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
  creator_name?: string
  created_by_type?: string
  visibility?: string
  space_id?: string
  member_count?: number
  created_at?: string
  updated_at?: string
}

interface PluginDetailPluginWire extends PluginListItemWire {
  plugin_json?: PluginPackageWire
}

interface RelationWire {
  relation_id?: string
  source_plugin_id?: string
  target_plugin_id: string
  relation_type: string
  sort_order?: number
  data?: Record<string, unknown>
}

interface PluginCategoryWire {
  category_id: string
  name: string
  icon_key?: string
  plugin_types?: string[]
  sort_order?: number
  plugin_count?: number
}

interface ExpertCategoryMaps {
  idToName: Map<string, string>
  nameToId: Map<string, string>
}

/** GET /admin/plugin_categories?plugin_type=… → id↔name maps (the unified wire
 *  keys categories by UUID; ExpertListItem.category is the display name). */
async function fetchExpertCategoryMaps(
  pluginType: PluginTypeWire
): Promise<ExpertCategoryMaps> {
  const resp = await expertApi.get<{ data: PluginCategoryWire[] }>(
    '/admin/plugin_categories',
    { params: { plugin_type: pluginType } }
  )
  const idToName = new Map<string, string>()
  const nameToId = new Map<string, string>()
  for (const c of resp.data.data ?? []) {
    idToName.set(c.category_id, c.name)
    nameToId.set(c.name, c.category_id)
  }
  return { idToName, nameToId }
}

/** Safely coerce a tags column that may arrive as string[] or JSON string. */
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

/** Unified plugin visibility → ExpertVisibility. The wire now emits only
 *  `system` | `space` | `private`; legacy `public` was folded into `system` by
 *  the backend migration, and any unknown value defaults to the global scope. */
function mapVisibility(v: string | undefined): ExpertVisibility {
  if (v === 'space') return 'space'
  if (v === 'private') return 'private'
  return 'system'
}

function mapPluginToExpertListItem(
  raw: PluginListItemWire,
  idToName: Map<string, string>
): ExpertListItem {
  const manifest = raw.manifest_json ?? {}
  return {
    expert_id: raw.plugin_id,
    // short_name is legacy server-derived; the pages fall back to name.slice(0,2)
    // when it is empty, so an empty value renders identically.
    short_name: '',
    name: raw.plugin_name || manifest.name || '',
    summary: manifest.description || '',
    category: (raw.category_id && idToName.get(raw.category_id)) || '',
    tags: normalizeTagsList(raw.tags),
    visibility: mapVisibility(raw.visibility),
    scope: raw.visibility ?? 'system',
    space_id: raw.space_id,
    creator_name: raw.creator_name || raw.publisher || '',
    created_by_type: raw.created_by_type,
    // The list projection carries no expert_skill relations, so the per-row
    // skill count is unavailable here (the detail load fills it in).
  }
}

function mapPluginToSquadListItem(
  raw: PluginListItemWire,
  idToName: Map<string, string>
): SquadListItem {
  const manifest = raw.manifest_json ?? {}
  return {
    squad_id: raw.plugin_id,
    short_name: '',
    name: raw.plugin_name || manifest.name || '',
    summary: manifest.description || '',
    category: (raw.category_id && idToName.get(raw.category_id)) || '',
    tags: normalizeTagsList(raw.tags),
    visibility: mapVisibility(raw.visibility),
    scope: raw.visibility ?? 'system',
    space_id: raw.space_id,
    creator_name: raw.creator_name || raw.publisher || '',
    created_by_type: raw.created_by_type,
    // The list wire projects a typed member_count for expert_team rows.
    member_count: raw.member_count,
  }
}

/** GET /admin/plugins/{id} → { plugin, relations }. */
async function fetchPluginDetail(
  id: string,
  includeRelations = true
): Promise<{ plugin: PluginDetailPluginWire; relations: RelationWire[] }> {
  const resp = await expertApi.get<{
    data: { plugin: PluginDetailPluginWire; relations: RelationWire[] }
  }>(`/admin/plugins/${encodeURIComponent(id)}`, {
    params: { include_relations: includeRelations },
  })
  return {
    plugin: resp.data.data.plugin,
    relations: resp.data.data.relations ?? [],
  }
}

/** A skill Plugin → SkillRef. has_content mirrors the tree-shaped skill package
 *  carrying a non-empty SKILL.md, which gates the SKILL.md viewer link; the same
 *  raw SKILL.md text is carried on `skill_md` so the viewer renders it
 *  client-side with no extra fetch. */
function skillRefFromPlugin(plugin: PluginDetailPluginWire): SkillRef {
  const md = rawAttachment(plugin.plugin_json, 'SKILL.md')
  return {
    name: plugin.plugin_name || plugin.manifest_json?.name || '',
    has_content: (md ?? '') !== '',
    skill_md: md,
  }
}

/** Resolve expert_skill relations (sorted by sort_order) into SkillRefs by
 *  fetching each target skill plugin for its name/content. */
async function resolveSkillRefs(relations: RelationWire[]): Promise<SkillRef[]> {
  const rels = relations
    .filter((r) => r.relation_type === 'expert_skill')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const plugins = await Promise.all(
    rels.map((r) => fetchPluginDetail(r.target_plugin_id, false))
  )
  return plugins.map((p) => skillRefFromPlugin(p.plugin))
}

interface ParsedTeamDoc {
  leader: string
  strategies: string[]
  dependencies: SquadDependencies
  permission: string
}

/** Recover the structured squad fields the unified wire only stores as rendered
 *  markdown in the team package's AGENTS.md (plugindoc.TeamAgentsMarkdown). The
 *  renderer is deterministic, so this parses its exact section layout back out;
 *  it is best-effort (a permission body containing a `### ` heading would be
 *  truncated) and any unrecovered field simply hides its detail section. */
function parseTeamAgentsMarkdown(md: string): ParsedTeamDoc {
  const strategies: string[] = []
  const blocking: string[] = []
  const recommended: string[] = []
  const permissionLines: string[] = []
  let leader = ''
  let section: 'none' | 'strategies' | 'deps' | 'permission' = 'none'
  for (const line of (md || '').split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('### ')) {
      const heading = trimmed.slice(4).trim()
      section =
        heading === '策略'
          ? 'strategies'
          : heading === '依赖'
            ? 'deps'
            : heading === '权限'
              ? 'permission'
              : 'none'
      continue
    }
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      section = 'none'
      continue
    }
    const leaderMatch = /^-\s*Leader:\s*(.+)$/.exec(trimmed)
    if (leaderMatch) {
      leader = leaderMatch[1].trim()
      continue
    }
    if (section === 'strategies') {
      const m = /^\d+\.\s+(.+)$/.exec(trimmed)
      if (m) strategies.push(m[1].trim())
    } else if (section === 'deps') {
      const b = /^-\s*阻塞:\s*(.+)$/.exec(trimmed)
      const r = /^-\s*推荐:\s*(.+)$/.exec(trimmed)
      if (b) blocking.push(b[1].trim())
      else if (r) recommended.push(r[1].trim())
    } else if (section === 'permission') {
      if (trimmed) permissionLines.push(trimmed)
    }
  }
  return {
    leader,
    strategies,
    dependencies: { blocking, recommended },
    permission: permissionLines.join('\n'),
  }
}

/** One expert_team_expert relation + its target expert plugin → SquadMember.
 *  member_key/role/is_leader are authoritative from the relation data, falling
 *  back to the member package's expert/context.json snapshot (mirrors
 *  install.go squadMemberFromPlugin). */
async function resolveSquadMember(rel: RelationWire): Promise<SquadMember> {
  const { plugin, relations } = await fetchPluginDetail(rel.target_plugin_id, true)
  const data = rel.data ?? {}
  let memberKey = typeof data.member_key === 'string' ? data.member_key : ''
  let role = typeof data.role === 'string' ? data.role : ''
  let isLeader = data.is_leader === true
  if (!memberKey && !role) {
    const ctx = jsonAttachment<{
      member_key?: string
      role?: string
      is_leader?: boolean
    }>(plugin.plugin_json, 'expert/context.json')
    if (ctx) {
      memberKey = ctx.member_key ?? ''
      role = ctx.role ?? ''
      isLeader = ctx.is_leader === true
    }
  }
  const skills = await resolveSkillRefs(relations)
  return {
    member_key: memberKey,
    name: plugin.plugin_name || plugin.manifest_json?.name || '',
    role,
    is_leader: isLeader,
    instruction: rawAttachment(plugin.plugin_json, 'AGENTS.md') ?? '',
    mcp_config: rawAttachment(plugin.plugin_json, 'mcp.json') ?? '{"mcpServers":{}}',
    skills,
  }
}

// ─── Experts ────────────────────────────────────────────────────────────────

/** GET /admin/plugins?plugin_type=expert — list expert plugins (the unified
 *  home of the legacy system expert catalog). */
export async function listSystemExperts(
  params: ListExpertParams = {}
): Promise<ListResponse<ExpertListItem>> {
  const { idToName } = await fetchExpertCategoryMaps('expert')
  const query: Record<string, unknown> = { plugin_type: 'expert' }
  const keyword = params.keyword?.trim()
  if (keyword) query.q = keyword
  const pageSize = params.limit && params.limit > 0 ? params.limit : 20
  query.page_size = pageSize
  query.page =
    params.offset && params.offset > 0 ? Math.floor(params.offset / pageSize) + 1 : 1
  const resp = await expertApi.get<ListEnvelope<PluginListItemWire>>('/admin/plugins', {
    params: query,
  })
  return {
    items: (resp.data.data ?? []).map((raw) =>
      mapPluginToExpertListItem(raw, idToName)
    ),
    total: resp.data.pagination?.total ?? 0,
  }
}

/** GET /admin/plugins/{id} — full expert detail, with skills resolved from the
 *  expert_skill relation targets. */
export async function getSystemExpert(id: string): Promise<ExpertDetail> {
  const [{ plugin, relations }, { idToName }] = await Promise.all([
    fetchPluginDetail(id, true),
    fetchExpertCategoryMaps('expert'),
  ])
  const base = mapPluginToExpertListItem(plugin, idToName)
  const skills = await resolveSkillRefs(relations)
  return {
    ...base,
    skill_count: skills.length,
    instruction: rawAttachment(plugin.plugin_json, 'AGENTS.md') ?? '',
    mcp_config: rawAttachment(plugin.plugin_json, 'mcp.json') ?? '{"mcpServers":{}}',
    skills,
    created_at: plugin.created_at ?? '',
    updated_at: plugin.updated_at ?? '',
  }
}

/** DELETE /admin/plugins/{id} — soft delete of an expert plugin. */
export async function deleteSystemExpert(id: string): Promise<void> {
  await expertApi.delete(`/admin/plugins/${encodeURIComponent(id)}`)
}

/** Re-upload an EXISTING expert's WHOLE container zip to
 *  `POST /admin/plugins/container_reupload/{id}` (multipart `file` + optional
 *  `category_id`). The server rebuilds the plugin in place — preserving
 *  plugin_id / visibility / Space / owner — while re-parsing the zip and swapping
 *  its bundled skills. `categoryName` is resolved to a unified plugin category id
 *  the same way importExpertContainer does; callers refresh via getSystemExpert. */
export async function reuploadExpertContainer(
  id: string,
  file: File | Blob,
  categoryName?: string,
  opts: { fileName?: string; signal?: AbortSignal } = {}
): Promise<void> {
  await reuploadContainer('expert', id, file, categoryName, opts)
}

// ─── Squads ───────────────────────────────────────────────────────────────

/** GET /admin/plugins?plugin_type=expert_team — list squad (expert_team)
 *  plugins. */
export async function listSystemSquads(
  params: ListExpertParams = {}
): Promise<ListResponse<SquadListItem>> {
  const { idToName } = await fetchExpertCategoryMaps('expert_team')
  const query: Record<string, unknown> = { plugin_type: 'expert_team' }
  const keyword = params.keyword?.trim()
  if (keyword) query.q = keyword
  const pageSize = params.limit && params.limit > 0 ? params.limit : 20
  query.page_size = pageSize
  query.page =
    params.offset && params.offset > 0 ? Math.floor(params.offset / pageSize) + 1 : 1
  const resp = await expertApi.get<ListEnvelope<PluginListItemWire>>('/admin/plugins', {
    params: query,
  })
  return {
    items: (resp.data.data ?? []).map((raw) =>
      mapPluginToSquadListItem(raw, idToName)
    ),
    total: resp.data.pagination?.total ?? 0,
  }
}

/** GET /admin/plugins/{id} — full squad detail. Members come from the
 *  expert_team_expert relation targets; leader/strategies/dependencies/
 *  permission are recovered from the team package AGENTS.md. */
export async function getSystemSquad(id: string): Promise<SquadDetail> {
  const [{ plugin, relations }, { idToName }] = await Promise.all([
    fetchPluginDetail(id, true),
    fetchExpertCategoryMaps('expert_team'),
  ])
  const base = mapPluginToSquadListItem(plugin, idToName)
  const memberRels = relations
    .filter((r) => r.relation_type === 'expert_team_expert')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const members = await Promise.all(memberRels.map(resolveSquadMember))
  const doc = parseTeamAgentsMarkdown(
    rawAttachment(plugin.plugin_json, 'AGENTS.md') ?? ''
  )
  const leaderMember = members.find((m) => m.is_leader)
  return {
    ...base,
    member_count: members.length,
    leader: doc.leader || leaderMember?.name || '',
    strategies: doc.strategies,
    dependencies: doc.dependencies,
    permission: doc.permission,
    members,
    created_at: plugin.created_at ?? '',
    updated_at: plugin.updated_at ?? '',
  }
}

/** DELETE /admin/plugins/{id} — soft delete of a squad plugin. */
export async function deleteSystemSquad(id: string): Promise<void> {
  await expertApi.delete(`/admin/plugins/${encodeURIComponent(id)}`)
}

/** Re-upload an EXISTING squad's WHOLE container zip to
 *  `POST /admin/plugins/container_reupload/{id}`. Twin of reuploadExpertContainer
 *  for plugin_type=expert_team — the server swaps the member experts and their
 *  skills in place; callers refresh via getSystemSquad. */
export async function reuploadSquadContainer(
  id: string,
  file: File | Blob,
  categoryName?: string,
  opts: { fileName?: string; signal?: AbortSignal } = {}
): Promise<void> {
  await reuploadContainer('expert_team', id, file, categoryName, opts)
}

// ─── Container import (server-side create) ─────────────────────────────────

export interface ImportContainerResult {
  plugin_id: string
}

/**
 * Upload a WHOLE expert/expert_team container zip to the server-side importer
 * (`POST /admin/plugins/import`, multipart `file` + optional `category_id`). The
 * backend parses the container and transactionally mints the top-level
 * expert/team plugin, its bundled skills as separate skill plugins, and the
 * relations wiring them. Replaces the old client-side unzip + per-skill presign
 * + flat `/admin/experts` create path.
 *
 * `categoryName` is resolved to a unified plugin category id via
 * /admin/plugin_categories (the importer takes a category UUID, not the
 * free-text manifest category); an unknown/blank name imports with no category
 * (the importer allows it). The container's tags come from the manifest inside
 * the zip — the importer accepts no tag override.
 */
export async function importExpertContainer(
  file: File | Blob,
  opts: {
    kind?: ExpertKind
    categoryName?: string
    fileName?: string
    signal?: AbortSignal
  } = {}
): Promise<ImportContainerResult> {
  const pluginType: PluginTypeWire = opts.kind === 'squad' ? 'expert_team' : 'expert'
  const form = await buildContainerForm(pluginType, file, opts.categoryName, opts.fileName)
  const resp = await expertApi.post<{ data: { plugin: { plugin_id: string } } }>(
    '/admin/plugins/import',
    form,
    { signal: opts.signal }
  )
  return { plugin_id: resp.data.data.plugin.plugin_id }
}

/** Build the multipart body shared by the container import + reupload routes:
 *  the raw `file` field plus an optional `category_id` resolved from a free-text
 *  category name via /admin/plugin_categories (an unknown/blank name is simply
 *  omitted — the server treats the container as having no category override). */
async function buildContainerForm(
  pluginType: PluginTypeWire,
  file: File | Blob,
  categoryName: string | undefined,
  fileNameOpt: string | undefined
): Promise<FormData> {
  const fileName = fileNameOpt ?? (file instanceof File ? file.name : 'container.zip')
  const uploadFile = file instanceof File ? file : new File([file], fileName)
  const form = new FormData()
  form.append('file', uploadFile, fileName)
  const trimmed = categoryName?.trim()
  if (trimmed) {
    const { nameToId } = await fetchExpertCategoryMaps(pluginType)
    const categoryId = nameToId.get(trimmed)
    if (categoryId) form.append('category_id', categoryId)
  }
  return form
}

/** POST the raw container zip to `POST /admin/plugins/container_reupload/{id}`
 *  (multipart `file` + optional `category_id`), rebuilding the existing plugin
 *  in place. The response is the rebuilt `{ plugin, relations }` detail, but
 *  callers re-fetch via getSystemExpert/getSystemSquad rather than hand-map it,
 *  so this resolves to void. */
async function reuploadContainer(
  pluginType: PluginTypeWire,
  id: string,
  file: File | Blob,
  categoryName: string | undefined,
  opts: { fileName?: string; signal?: AbortSignal } = {}
): Promise<void> {
  const form = await buildContainerForm(pluginType, file, categoryName, opts.fileName)
  await expertApi.post(
    `/admin/plugins/container_reupload/${encodeURIComponent(id)}`,
    form,
    { signal: opts.signal }
  )
}

// ─── Categories ─────────────────────────────────────────────────────────────

// ─── Categories / tags (unified plugin surface) ─────────────────────────────
//
// The 分类 tab under Expert Market manages the categories shared by expert +
// expert_team, so it reads/writes the unified /admin/plugin_categories taxonomy.
// Each row carries plugin_types ["expert","expert_team"]. Tags stay on their
// legacy /admin/expert_tags route (out of scope for the unified migration).

/** Map a unified category wire row to the ExpertCategory the 分类 tab renders. */
function toExpertCategory(c: PluginCategoryWire): ExpertCategory {
  return {
    expert_category_id: c.category_id,
    name: c.name,
    icon_key: c.icon_key,
    sort_order: c.sort_order ?? 0,
    count: c.plugin_count,
  }
}

// plugin_types the expert-market category tab manages: categories are shared by
// standalone experts and expert teams, matching the observed data where expert
// categories carry both types.
const EXPERT_CATEGORY_PLUGIN_TYPES = ['expert', 'expert_team'] as const

export async function listExpertCategories(): Promise<ExpertCategory[]> {
  const resp = await expertApi.get<{ data: PluginCategoryWire[] }>(
    '/admin/plugin_categories',
    { params: { plugin_type: 'expert' } }
  )
  return (resp.data.data ?? []).map(toExpertCategory)
}

export async function createExpertCategory(params: {
  name: string
  icon_key?: string
  sort_order?: number
}): Promise<ExpertCategory> {
  const resp = await expertApi.post<{ data: PluginCategoryWire }>(
    '/admin/plugin_categories',
    {
      name: params.name,
      icon_key: params.icon_key ?? '',
      plugin_types: EXPERT_CATEGORY_PLUGIN_TYPES,
      sort_order: params.sort_order ?? 0,
    }
  )
  return toExpertCategory(resp.data.data)
}

export async function updateExpertCategory(
  id: string,
  params: { name?: string; icon_key?: string; sort_order?: number }
): Promise<ExpertCategory> {
  const resp = await expertApi.patch<{ data: PluginCategoryWire }>(
    `/admin/plugin_categories/${encodeURIComponent(id)}`,
    {
      name: params.name ?? '',
      icon_key: params.icon_key ?? '',
      plugin_types: EXPERT_CATEGORY_PLUGIN_TYPES,
      sort_order: params.sort_order ?? 0,
    }
  )
  return toExpertCategory(resp.data.data)
}

export async function deleteExpertCategory(id: string): Promise<void> {
  await expertApi.delete(`/admin/plugin_categories/${encodeURIComponent(id)}`)
}

// ─── Tags (read-only suggestions) ────────────────────────────────────────────
//
// Removed: the legacy admin tag suggestion endpoint (`/admin/expert_tags`) was
// unused in the admin UI and has been retired on the backend. If tag
// suggestions are reintroduced, use the unified `/plugin_tags` aggregation.
