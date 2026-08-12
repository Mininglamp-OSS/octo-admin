/**
 * Turns a parsed container into a create request: presign-upload every bundled
 * skill package, then assemble the flat manifest the admin API expects. The
 * build* functions are pure (given the uploaded-key map) so the wiring stays
 * testable and the modal only orchestrates.
 */

import {
  uploadExpertSkill,
  type CreateExpertParams,
  type CreateSquadParams,
  type SkillWrite,
} from '../../api/expert'
import type {
  ParsedExpert,
  ParsedSkill,
  ParsedSquad,
  ResolvedSkillFile,
} from './parseContainer'

/** Presign + PUT each bundled package. Returns a container-path → SkillWrite
 *  map. `onProgress(done,total)` fires after each upload for a progress line. */
export async function uploadSkillFiles(
  skillFiles: Map<string, ResolvedSkillFile>,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, SkillWrite>> {
  const out = new Map<string, SkillWrite>()
  const total = skillFiles.size
  let done = 0
  for (const [path, f] of skillFiles) {
    const written = await uploadExpertSkill(f.skillName, f.blob, f.fileName)
    out.set(path, written)
    done += 1
    onProgress?.(done, total)
  }
  return out
}

function resolveSkills(
  skills: ParsedSkill[],
  uploaded: Map<string, SkillWrite>
): SkillWrite[] {
  return skills.map((s) => {
    if (!s.file) return { name: s.name }
    const up = uploaded.get(s.file)
    // Two skills may reference the same bundled package (uploaded once, keyed by
    // path). Reuse its upload_object_key but keep THIS skill's own name — the
    // uploaded entry carries only the first referencing skill's name.
    return up ? { ...up, name: s.name } : { name: s.name }
  })
}

export interface MetaOverride {
  category?: string
  tags?: string[]
}

export function buildExpertParams(
  m: ParsedExpert,
  uploaded: Map<string, SkillWrite>,
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
    skills: resolveSkills(m.skills, uploaded),
  }
}

export function buildSquadParams(
  m: ParsedSquad,
  uploaded: Map<string, SkillWrite>,
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
      skills: resolveSkills(mem.skills, uploaded),
    })),
  }
}
