/**
 * Parser for schema_version=2 expert/squad manifests.
 *
 * A v2 container carries no Skill package, MCP config or member content: it
 * lists IDs of assets that are already published in the market. With the
 * references rollout enabled the backend requires a released `version_id` on
 * every skill and member; a Connector must never carry one.
 *
 * Kept separate from parseContainer.ts so the legacy bundle parser stays intact
 * while the new flow is wired in; both raise ContainerError so the modal can
 * render one error surface.
 */

import JSZip from 'jszip'
import { ContainerError, MAX_CONNECTORS, MAX_MEMBERS, MAX_NAME_LEN, MAX_SKILLS, MAX_SUMMARY_LEN, MAX_TAGS, readBoundedContainerManifest, type BoundedContainerManifest } from './parseContainer'

export interface ReferencedRef {
  id: string
  version_id?: string
}

export interface ReferencedMember extends ReferencedRef {
  member_key: string
  role: string
  is_leader: boolean
}

export interface ReferencedExpert {
  schema_version: '2'
  kind: 'agent'
  name: string
  summary?: string
  tags?: string[]
  instruction: string
  skills: ReferencedRef[]
  connectors: ReferencedRef[]
}

export interface ReferencedSquad {
  schema_version: '2'
  kind: 'squad'
  name: string
  summary?: string
  tags?: string[]
  instruction: string
  members: ReferencedMember[]
}

export type ReferencedManifest = ReferencedExpert | ReferencedSquad

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const MEMBER_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** The backend decoder is closed; reject unknown root fields here so an archive
 *  it would refuse never reaches the upload. */
function rejectUnknownKeys(rec: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(rec)) {
    if (!allowed.includes(key)) {
      throw new ContainerError('containerRootInvalid', `unknown field "${key}"`)
    }
  }
}

function requiredString(value: unknown, code: string, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ContainerError(code, `${where} is required`)
  }
  return value.trim()
}

function optionalVersion(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !ID_PATTERN.test(value.trim())) {
    throw new ContainerError('dependencyVersionInvalid', `${where}.version_id is invalid`)
  }
  return value.trim()
}

function parseRefs(raw: unknown, where: string, withVersion: boolean, tooManyCode: string): ReferencedRef[] {
  if (raw === undefined || raw === null) return []
  const connector = where === 'connectors'
  if (!Array.isArray(raw)) {
    throw new ContainerError(connector ? 'connectorsType' : 'skillsType', `${where} must be an array`)
  }
  const limit = connector ? MAX_CONNECTORS : MAX_SKILLS
  if (raw.length > limit) {
    throw new ContainerError(tooManyCode, `${where} exceeds ${limit}`)
  }
  const seen = new Set<string>()
  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new ContainerError(connector ? 'connectorIdRequired' : 'skillIdRequired', `${where}[${index}] must be an object`)
    }
    const rec = entry as Record<string, unknown>
    rejectUnknownKeys(rec, ['id', 'version_id'])
    const id = requiredString(rec.id, connector ? 'connectorIdRequired' : 'skillIdRequired', `${where}[${index}].id`)
    if (!ID_PATTERN.test(id)) {
      throw new ContainerError(connector ? 'connectorIdInvalid' : 'skillIdInvalid', `${where}[${index}].id is invalid`)
    }
    if (seen.has(id)) {
      throw new ContainerError('duplicateDependency', `${where}[${index}] duplicates ${id}`)
    }
    seen.add(id)
    if (!withVersion) {
      if (rec.version_id !== undefined && rec.version_id !== null && rec.version_id !== '') {
        throw new ContainerError('dependencyVersionForbidden', `${where}[${index}] connector must not pin a version`)
      }
      return { id }
    }
    const version_id = optionalVersion(rec.version_id, `${where}[${index}]`)
    if (!version_id) {
      throw new ContainerError('dependencyVersionRequired', `${where}[${index}].version_id is required when references are enabled`)
    }
    return { id, version_id }
  })
}

function parseTags(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    throw new ContainerError('tagsType', 'tags must be an array')
  }
  const tags = raw.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim())
  if (tags.length > MAX_TAGS) {
    throw new ContainerError('tagsTooMany', `tags exceed ${MAX_TAGS}`)
  }
  return tags
}

function parseMembers(raw: unknown): ReferencedMember[] {
  if (!Array.isArray(raw) || raw.length < 1) {
    throw new ContainerError('membersRequired', `members must contain 1..${MAX_MEMBERS} entries`)
  }
  if (raw.length > MAX_MEMBERS) {
    throw new ContainerError('membersTooMany', `members must contain at most ${MAX_MEMBERS} entries`)
  }
  const seenID = new Set<string>()
  const seenKey = new Set<string>()
  let leaders = 0
  const members = raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new ContainerError('teamWiringInvalid', `members[${index}] must be an object`)
    }
    const rec = entry as Record<string, unknown>
    rejectUnknownKeys(rec, ['id', 'version_id', 'member_key', 'role', 'is_leader'])
    const id = requiredString(rec.id, 'memberIdRequired', `members[${index}].id`)
    if (!ID_PATTERN.test(id)) {
      throw new ContainerError('memberIdInvalid', `members[${index}].id is invalid`)
    }
    const memberKey = requiredString(rec.member_key, 'teamWiringInvalid', `members[${index}].member_key`)
    if (!MEMBER_KEY_PATTERN.test(memberKey)) {
      throw new ContainerError('teamWiringInvalid', `members[${index}].member_key is invalid`)
    }
    const role = requiredString(rec.role, 'teamWiringInvalid', `members[${index}].role`)
    if (seenID.has(id)) {
      throw new ContainerError('duplicateDependency', `members[${index}] duplicates ${id}`)
    }
    if (seenKey.has(memberKey)) {
      throw new ContainerError('memberKeyDup', `members[${index}].member_key is not unique`)
    }
    seenID.add(id)
    seenKey.add(memberKey)
    const isLeader = rec.is_leader === true
    if (isLeader) leaders += 1
    const version_id = optionalVersion(rec.version_id, `members[${index}]`)
    if (!version_id) {
      throw new ContainerError('memberVersionRequired', `members[${index}].version_id is required when references are enabled`)
    }
    return { id, version_id, member_key: memberKey, role, is_leader: isLeader }
  })
  if (leaders !== 1) {
    throw new ContainerError('leaderCount', 'exactly one leader is required')
  }
  return members
}

/** Parse a v2 manifest object. Throws ContainerError with a stable code. */
export function parseReferencedManifest(raw: unknown, kind: 'agent' | 'squad'): ReferencedManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new ContainerError('containerRootInvalid', 'manifest must be an object')
  }
  const rec = raw as Record<string, unknown>
  if (rec.schema_version !== '2') {
    throw new ContainerError('legacyContainerFormat', 'schema_version must be "2"')
  }
  const name = requiredString(rec.name, 'nameRequired', 'name')
  if (name.length > MAX_NAME_LEN) {
    throw new ContainerError('nameTooLong', `name exceeds ${MAX_NAME_LEN} characters`)
  }
  const instruction = requiredString(rec.instruction, 'instructionRequired', 'instruction')
  const summary = typeof rec.summary === 'string' ? rec.summary : undefined
  if (summary !== undefined && summary.length > MAX_SUMMARY_LEN) {
    throw new ContainerError('summaryTooLong', `summary exceeds ${MAX_SUMMARY_LEN} characters`)
  }
  if (kind === 'agent') {
    if (rec.kind !== 'agent') {
      throw new ContainerError('containerRootInvalid', 'kind must be "agent"')
    }
    rejectUnknownKeys(rec, ['schema_version', 'kind', 'name', 'summary', 'tags', 'instruction', 'skills', 'connectors'])
    const tags = parseTags(rec.tags)
    return {
      schema_version: '2',
      kind: 'agent',
      name,
      summary,
      tags,
      instruction,
      skills: parseRefs(rec.skills, 'skills', true, 'skillsTooMany'),
      connectors: parseRefs(rec.connectors, 'connectors', false, 'connectorsTooMany'),
    }
  }
  if (rec.kind !== 'squad') {
    throw new ContainerError('containerRootInvalid', 'kind must be "squad"')
  }
  rejectUnknownKeys(rec, ['schema_version', 'kind', 'name', 'summary', 'tags', 'instruction', 'members'])
  return {
    schema_version: '2',
    kind: 'squad',
    name,
    summary,
    tags: parseTags(rec.tags),
    instruction,
    members: parseMembers(rec.members),
  }
}

/** True when a parsed JSON object declares the id-referenced container format. */
export function isReferencedManifest(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>).schema_version === '2'
}


/** Read the manifest through the shared bounded reader, then parse it when it
 *  declares schema_version=2. Legacy containers return null only after the
 *  bounded read, so format detection never inflates an unbounded manifest. */
export function parseReferencedFromBounded(
  bounded: BoundedContainerManifest
): ReferencedManifest | null {
  if (!isReferencedManifest(bounded.raw)) return null
  rejectEmbeddedEntries(bounded.zip, bounded.kind)
  return parseReferencedManifest(bounded.raw, bounded.kind)
}

/** Detect a v2 container from one bounded read. Callers that need the legacy
 *  parser pass the same `bounded` value on so the archive is inflated once. */
export async function detectReferencedContainer(file: Blob): Promise<ReferencedManifest | null> {
  return parseReferencedFromBounded(await readBoundedContainerManifest(file))
}

/** A v2 container is a manifest only. Whitelist exactly the manifest that
 *  matches the detected kind so no other entry can ride along (the backend
 *  decoder is equally strict about the archive's shape). */
function rejectEmbeddedEntries(zip: JSZip, kind: 'agent' | 'squad'): void {
  const manifest = kind === 'agent' ? 'expert.json' : 'squad.json'
  for (const path of Object.keys(zip.files)) {
    if (zip.files[path].dir) continue
    if (path === manifest) continue
    // The backend accepts exactly one file, so keeping Finder metadata would
    // pass preflight and then fail on submission. Reject it here instead.
    throw new ContainerError('embeddedPayload', `a v2 container must contain only ${manifest} (found ${path})`)
  }
}

/** Number of dependencies a v2 manifest references. */
export function referencedCount(manifest: ReferencedManifest): number {
  return manifest.kind === 'agent' ? manifest.skills.length + manifest.connectors.length : manifest.members.length
}
