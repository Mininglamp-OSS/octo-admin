/**
 * Turns a parsed container into create/patch requests.
 *
 * Upload orchestration performs ONE presign+PUT per file-bearing skill
 * REFERENCE: the server consumes and deletes each upload_object_key while
 * storing the package (single-use temp object), so two skills referencing the
 * same bundled file need two uploaded objects — the Blob itself is still
 * unzipped/deduped once per container path by parseContainer. The build*
 * functions stay pure (given resolved SkillWrite lists) so the wiring is
 * testable and callers only orchestrate.
 */

import {
  uploadExpertSkill,
  type CreateExpertParams,
  type CreateSquadParams,
  type PatchExpertParams,
  type PatchSquadParams,
  type SkillWrite,
} from '../../api/expert'
import type {
  ParsedExpert,
  ParsedSkill,
  ParsedSquad,
  ResolvedSkillFile,
} from './parseContainer'

/** Injected so tests can fake the presign+PUT round-trip, and so callers can
 *  thread an AbortSignal through uploadExpertSkill. */
export type SkillUploader = (
  name: string,
  blob: Blob,
  fileName: string
) => Promise<SkillWrite>

/** Presign + PUT one object per file-bearing reference in `skills`; name-only
 *  references pass through as `{name}`. */
export async function uploadSkillWrites(
  skills: ParsedSkill[],
  skillFiles: Map<string, ResolvedSkillFile>,
  upload: SkillUploader = uploadExpertSkill
): Promise<SkillWrite[]> {
  const out: SkillWrite[] = []
  for (const s of skills) {
    const f = s.file ? skillFiles.get(s.file) : undefined
    out.push(f ? await upload(s.name, f.blob, f.fileName) : { name: s.name })
  }
  return out
}

/** Squad twin: per-member SkillWrite lists keyed by member_key. */
export async function uploadSquadSkillWrites(
  m: ParsedSquad,
  skillFiles: Map<string, ResolvedSkillFile>,
  upload: SkillUploader = uploadExpertSkill
): Promise<Map<string, SkillWrite[]>> {
  const out = new Map<string, SkillWrite[]>()
  for (const mem of m.members) {
    out.set(mem.member_key, await uploadSkillWrites(mem.skills, skillFiles, upload))
  }
  return out
}

export interface MetaOverride {
  category?: string
  tags?: string[]
}

export function buildExpertParams(
  m: ParsedExpert,
  skills: SkillWrite[],
  override: MetaOverride = {}
): CreateExpertParams {
  // short_name is server-owned (derived from name) — never sent on write.
  return {
    name: m.name,
    summary: m.summary,
    category: override.category ?? m.category,
    tags: override.tags ?? m.tags,
    instruction: m.instruction,
    mcp_config: m.mcp_config,
    skills,
  }
}

export function buildSquadParams(
  m: ParsedSquad,
  memberSkills: Map<string, SkillWrite[]>,
  override: MetaOverride = {}
): CreateSquadParams {
  return {
    name: m.name,
    summary: m.summary,
    category: override.category ?? m.category,
    tags: override.tags ?? m.tags,
    leader: m.leader,
    strategies: m.strategies,
    dependencies: m.dependencies,
    permission: m.permission,
    members: m.members.map((mem) => ({
      member_key: mem.member_key,
      name: mem.name,
      role: mem.role,
      is_leader: mem.is_leader,
      instruction: mem.instruction,
      mcp_config: mem.mcp_config,
      skills: memberSkills.get(mem.member_key) ?? [],
    })),
  }
}

// ─── PATCH builders (re-upload) ──────────────────────────────────────────────
//
// The server's patch semantics are pointer-based: a present-but-empty value
// CLEARS the stored field. parseContainer normalizes missing manifest fields
// to empty values, so a container that simply omits tags/strategies/… must
// not wipe curated data — omit those fields from the PATCH body instead.

export function buildExpertPatch(m: ParsedExpert, skills: SkillWrite[]): PatchExpertParams {
  const p: PatchExpertParams = {
    name: m.name,
    summary: m.summary,
    instruction: m.instruction,
    mcp_config: m.mcp_config,
    skills,
  }
  if (m.category) p.category = m.category
  if (m.tags.length > 0) p.tags = m.tags
  return p
}

export function buildSquadPatch(
  m: ParsedSquad,
  memberSkills: Map<string, SkillWrite[]>
): PatchSquadParams {
  const p: PatchSquadParams = {
    name: m.name,
    summary: m.summary,
    leader: m.leader,
    // Members always replace wholesale — that is the point of a re-upload.
    members: m.members.map((mem) => ({
      member_key: mem.member_key,
      name: mem.name,
      role: mem.role,
      is_leader: mem.is_leader,
      instruction: mem.instruction,
      mcp_config: mem.mcp_config,
      skills: memberSkills.get(mem.member_key) ?? [],
    })),
  }
  if (m.category) p.category = m.category
  if (m.tags.length > 0) p.tags = m.tags
  if (m.strategies.length > 0) p.strategies = m.strategies
  if (m.dependencies.blocking.length > 0 || m.dependencies.recommended.length > 0) {
    p.dependencies = m.dependencies
  }
  if (m.permission) p.permission = m.permission
  return p
}
