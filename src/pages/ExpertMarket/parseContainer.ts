/**
 * Client-side expert/squad container parser.
 *
 * A container zip is a plain archive holding one manifest — `expert.json` or
 * `squad.json` (which of the two decides the kind) — at its root, plus the
 * bundled Agent-Skill packages it references (each a whole `.zip`/`.skill`),
 * conventionally under `skills/`. The manifest's `skills[]` reference a package
 * by container path: `{ "name": "…", "file": "skills/x.zip" }`. A name-only
 * entry `{ "name": "…" }` carries no package.
 *
 * The browser unzips and validates the container here; it is NEVER uploaded.
 * Only the bundled skill packages later go to object storage (presigned). This
 * mirrors octo-cli `marketplace expert create` (skills/octo-marketplace/expert.md).
 *
 * Manifest validation/normalization is pure (parseManifest) so it can be unit
 * tested without JSZip; blob resolution (parseExpertContainer) is the async I/O
 * shell around it.
 */

import JSZip from 'jszip'

// Limits mirror octo-marketplace internal/model/expert.go so the client rejects
// oversized input before any upload/create round-trip.
export const MAX_NAME_LEN = 128
export const MAX_SUMMARY_LEN = 512
export const MAX_SHORT_NAME_LEN = 16
export const MAX_SKILLS = 20
export const MAX_MEMBERS = 30
export const MAX_STRATEGIES = 30
export const MAX_TAGS = 20
export const MAX_MCP_CONFIG_BYTES = 64 * 1024
export const MAX_SKILL_PACKAGE_BYTES = 20 * 1024 * 1024
/** Whole-container ceiling, checked BEFORE JSZip inflates anything: the max
 *  legal payload is ~20 packages × 20 MiB, so anything past 512 MiB can only
 *  be malformed and would otherwise freeze the tab mid-extraction. */
export const MAX_CONTAINER_BYTES = 512 * 1024 * 1024

/** A parse/validation failure. `code` is a stable i18n key suffix; `message`
 *  is a human-readable fallback. */
export class ContainerError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ContainerError'
    this.code = code
  }
}

export interface ParsedSkill {
  name: string
  /** Container-relative path of the bundled package, if any. */
  file?: string
}

export interface ParsedExpert {
  kind: 'agent'
  name: string
  short_name?: string
  summary: string
  category: string
  tags: string[]
  instruction: string
  mcp_config: string
  skills: ParsedSkill[]
}

export interface ParsedSquadMember {
  member_key: string
  name: string
  role: string
  is_leader: boolean
  instruction: string
  mcp_config: string
  skills: ParsedSkill[]
}

export interface ParsedSquad {
  kind: 'squad'
  name: string
  short_name?: string
  summary: string
  category: string
  tags: string[]
  leader: string
  strategies: string[]
  dependencies: { blocking: string[]; recommended: string[] }
  permission: string
  members: ParsedSquadMember[]
}

export type ParsedManifest = ParsedExpert | ParsedSquad

/** A skill package resolved out of the container, ready to presign-upload. */
export interface ResolvedSkillFile {
  /** Manifest skill name it belongs to. */
  skillName: string
  /** Container path (unique key). */
  path: string
  fileName: string
  blob: Blob
}

export interface ParsedContainer {
  manifest: ParsedManifest
  /** Bundled packages keyed by container path. */
  skillFiles: Map<string, ResolvedSkillFile>
}

// ─── Path safety ──────────────────────────────────────────────────────────

/** Reject absolute paths, drive letters, and `..` traversal in a container
 *  reference — same archive-safety rule as Skill install. */
export function isUnsafeEntryPath(p: string): boolean {
  if (!p) return true
  if (p.startsWith('/') || p.startsWith('\\')) return true
  if (/^[a-zA-Z]:/.test(p)) return true
  return p
    .split(/[\\/]/)
    .some((seg) => seg === '..')
}

function hasSkillExtension(p: string): boolean {
  const lower = p.toLowerCase()
  return lower.endsWith('.zip') || lower.endsWith('.skill')
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

// ─── Pure manifest normalization + validation ───────────────────────────────

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
}

function validateMcpConfig(raw: unknown, where: string): string {
  // Default to an empty server map when omitted.
  const s = raw == null || raw === '' ? '{"mcpServers":{}}' : raw
  if (typeof s !== 'string') {
    throw new ContainerError('mcpConfigType', `${where}: mcp_config must be a JSON string`)
  }
  if (byteLength(s) > MAX_MCP_CONFIG_BYTES) {
    throw new ContainerError('mcpConfigTooLarge', `${where}: mcp_config exceeds 64 KiB`)
  }
  try {
    JSON.parse(s)
  } catch {
    throw new ContainerError('mcpConfigInvalid', `${where}: mcp_config is not valid JSON`)
  }
  return s
}

function normalizeSkills(raw: unknown, where: string): ParsedSkill[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) {
    throw new ContainerError('skillsType', `${where}: skills must be an array`)
  }
  if (raw.length > MAX_SKILLS) {
    throw new ContainerError('skillsTooMany', `${where}: at most ${MAX_SKILLS} skills`)
  }
  return raw.map((item, i) => {
    const rec = (item ?? {}) as Record<string, unknown>
    const name = asString(rec.name).trim()
    if (!name) {
      throw new ContainerError('skillNameRequired', `${where}: skills[${i}].name is required`)
    }
    const file = asString(rec.file).trim()
    if (file) {
      if (isUnsafeEntryPath(file)) {
        throw new ContainerError('skillPathUnsafe', `${where}: unsafe skill path "${file}"`)
      }
      if (!hasSkillExtension(file)) {
        throw new ContainerError('skillExtInvalid', `${where}: skill "${file}" must be .zip/.skill`)
      }
      return { name, file }
    }
    return { name }
  })
}

function validateCommonMeta(rec: Record<string, unknown>): {
  name: string
  short_name?: string
  summary: string
  category: string
  tags: string[]
} {
  const name = asString(rec.name).trim()
  if (!name) throw new ContainerError('nameRequired', 'name is required')
  if (name.length > MAX_NAME_LEN) {
    throw new ContainerError('nameTooLong', `name exceeds ${MAX_NAME_LEN} chars`)
  }
  const summary = asString(rec.summary).trim()
  if (!summary) throw new ContainerError('summaryRequired', 'summary is required')
  if (summary.length > MAX_SUMMARY_LEN) {
    throw new ContainerError('summaryTooLong', `summary exceeds ${MAX_SUMMARY_LEN} chars`)
  }
  const shortName = asString(rec.short_name).trim()
  if (shortName.length > MAX_SHORT_NAME_LEN) {
    throw new ContainerError('shortNameTooLong', `short_name exceeds ${MAX_SHORT_NAME_LEN} chars`)
  }
  const tags = asStringArray(rec.tags)
  if (tags.length > MAX_TAGS) {
    throw new ContainerError('tagsTooMany', `at most ${MAX_TAGS} tags`)
  }
  return {
    name,
    short_name: shortName || undefined,
    summary,
    category: asString(rec.category).trim(),
    tags,
  }
}

function parseExpertManifest(rec: Record<string, unknown>): ParsedExpert {
  const meta = validateCommonMeta(rec)
  const instruction = asString(rec.instruction).trim()
  if (!instruction) {
    throw new ContainerError('instructionRequired', 'instruction is required')
  }
  return {
    kind: 'agent',
    ...meta,
    instruction,
    mcp_config: validateMcpConfig(rec.mcp_config, 'expert'),
    skills: normalizeSkills(rec.skills, 'expert'),
  }
}

function parseSquadManifest(rec: Record<string, unknown>): ParsedSquad {
  const meta = validateCommonMeta(rec)
  const rawMembers = rec.members
  if (!Array.isArray(rawMembers) || rawMembers.length === 0) {
    throw new ContainerError('membersRequired', 'squad requires at least one member')
  }
  if (rawMembers.length > MAX_MEMBERS) {
    throw new ContainerError('membersTooMany', `at most ${MAX_MEMBERS} members`)
  }
  const strategies = asStringArray(rec.strategies)
  if (strategies.length > MAX_STRATEGIES) {
    throw new ContainerError('strategiesTooMany', `at most ${MAX_STRATEGIES} strategies`)
  }
  const seenKeys = new Set<string>()
  const members: ParsedSquadMember[] = rawMembers.map((m, i) => {
    const rmem = (m ?? {}) as Record<string, unknown>
    const name = asString(rmem.name).trim()
    if (!name) throw new ContainerError('memberNameRequired', `members[${i}].name is required`)
    const memberKey = asString(rmem.member_key).trim() || `member-${i + 1}`
    if (seenKeys.has(memberKey)) {
      throw new ContainerError('memberKeyDup', `duplicate member_key "${memberKey}"`)
    }
    seenKeys.add(memberKey)
    const instruction = asString(rmem.instruction).trim()
    if (!instruction) {
      throw new ContainerError('memberInstructionRequired', `members[${i}].instruction is required`)
    }
    // The backend's buildMembers rejects an empty role (ErrInvalidMembers),
    // so surface it here instead of after the skill packages have uploaded.
    const role = asString(rmem.role).trim()
    if (!role) {
      throw new ContainerError('memberRoleRequired', `members[${i}].role is required`)
    }
    return {
      member_key: memberKey,
      name,
      role,
      is_leader: rmem.is_leader === true,
      instruction,
      mcp_config: validateMcpConfig(rmem.mcp_config, `members[${i}]`),
      skills: normalizeSkills(rmem.skills, `members[${i}]`),
    }
  })
  const leaderCount = members.filter((m) => m.is_leader).length
  if (leaderCount !== 1) {
    throw new ContainerError(
      'leaderCount',
      `squad must have exactly one leader (found ${leaderCount})`
    )
  }
  const leaderMember = members.find((m) => m.is_leader)!
  const depsRaw = (rec.dependencies ?? {}) as Record<string, unknown>
  return {
    kind: 'squad',
    ...meta,
    leader: asString(rec.leader).trim() || leaderMember.name,
    strategies,
    dependencies: {
      blocking: asStringArray(depsRaw.blocking),
      recommended: asStringArray(depsRaw.recommended),
    },
    permission: asString(rec.permission).trim(),
    members,
  }
}

/** Parse + validate a manifest object of the given kind. Pure — no I/O. */
export function parseManifest(kind: ExpertKindLike, raw: unknown): ParsedManifest {
  if (raw == null || typeof raw !== 'object') {
    throw new ContainerError('manifestInvalid', 'manifest is not a JSON object')
  }
  const rec = raw as Record<string, unknown>
  return kind === 'squad' ? parseSquadManifest(rec) : parseExpertManifest(rec)
}

type ExpertKindLike = 'agent' | 'squad'

// ─── Async container (zip) parsing ───────────────────────────────────────────

/**
 * Unzip a container, locate its manifest, validate it, and resolve every
 * referenced skill package into a Blob. Throws ContainerError on any problem.
 */
export async function parseExpertContainer(file: File | Blob): Promise<ParsedContainer> {
  if (file.size > MAX_CONTAINER_BYTES) {
    throw new ContainerError('containerTooLarge', 'container exceeds 512 MiB')
  }
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new ContainerError('zipInvalid', 'file is not a valid zip archive')
  }

  const expertJson = zip.file('expert.json')
  const squadJson = zip.file('squad.json')
  if (expertJson && squadJson) {
    throw new ContainerError('manifestAmbiguous', 'container has both expert.json and squad.json')
  }
  const manifestFile = expertJson ?? squadJson
  if (!manifestFile) {
    throw new ContainerError('manifestMissing', 'container has no expert.json or squad.json')
  }
  const kind: ExpertKindLike = squadJson ? 'squad' : 'agent'

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(await manifestFile.async('string'))
  } catch {
    throw new ContainerError('manifestParse', 'manifest JSON is malformed')
  }

  const manifest = parseManifest(kind, rawManifest)

  // Collect the set of referenced skill files (expert or all squad members).
  const refs: ParsedSkill[] =
    manifest.kind === 'squad'
      ? manifest.members.flatMap((m) => m.skills)
      : manifest.skills

  const skillFiles = new Map<string, ResolvedSkillFile>()
  for (const skill of refs) {
    if (!skill.file || skillFiles.has(skill.file)) continue
    const entry = zip.file(skill.file)
    if (!entry) {
      throw new ContainerError('skillFileMissing', `bundled package "${skill.file}" not found in container`)
    }
    const blob = await entry.async('blob')
    if (blob.size > MAX_SKILL_PACKAGE_BYTES) {
      throw new ContainerError('skillFileTooLarge', `package "${skill.file}" exceeds 20 MiB`)
    }
    skillFiles.set(skill.file, {
      skillName: skill.name,
      path: skill.file,
      fileName: basename(skill.file),
      blob,
    })
  }

  return { manifest, skillFiles }
}
