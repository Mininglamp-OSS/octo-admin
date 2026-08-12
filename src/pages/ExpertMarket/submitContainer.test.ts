/**
 * Coverage for the upload orchestration + pure request builders. The
 * load-bearing contract: the server consumes each upload_object_key while
 * storing it (single-use), so two skills referencing the same bundled file
 * must produce TWO uploads with distinct keys — and re-upload PATCH bodies
 * must omit fields the container doesn't declare (present-but-empty clears
 * server-side).
 */

import { describe, expect, it } from 'vitest'
import type { SkillWrite } from '../../api/expert'
import {
  buildExpertParams,
  buildExpertPatch,
  buildSquadParams,
  buildSquadPatch,
  uploadSkillWrites,
  uploadSquadSkillWrites,
  type SkillUploader,
} from './submitContainer'
import type { ParsedExpert, ParsedSquad, ResolvedSkillFile } from './parseContainer'

const skillFiles = new Map<string, ResolvedSkillFile>([
  [
    'skills/x.zip',
    { skillName: '清单A', path: 'skills/x.zip', fileName: 'x.zip', blob: new Blob(['zip']) },
  ],
])

/** Fake presign+PUT that returns a fresh key per call. */
function fakeUploader(): { upload: SkillUploader; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    upload: async (name, _blob, fileName) => {
      calls.push(name)
      return { name, upload_object_key: `k-${calls.length}`, file_name: fileName, file_size: 3 }
    },
  }
}

function expert(skills: ParsedExpert['skills']): ParsedExpert {
  return {
    kind: 'agent',
    name: 'e',
    summary: 's',
    category: '研发工具',
    tags: ['t'],
    instruction: 'i',
    mcp_config: '{}',
    skills,
  }
}

function squad(overrides: Partial<ParsedSquad> = {}): ParsedSquad {
  return {
    kind: 'squad',
    name: 'sq',
    summary: 's',
    category: '营销策划',
    tags: [],
    leader: 'L',
    strategies: ['a'],
    dependencies: { blocking: [], recommended: [] },
    permission: '',
    members: [
      { member_key: 'l', name: 'L', role: 'leader', is_leader: true, instruction: 'i', mcp_config: '{}', skills: [{ name: '清单A', file: 'skills/x.zip' }] },
      { member_key: 'm', name: 'M', role: 'ic', is_leader: false, instruction: 'i', mcp_config: '{}', skills: [] },
    ],
    ...overrides,
  }
}

describe('uploadSkillWrites', () => {
  it('uploads once PER REFERENCE — a shared package gets distinct keys', async () => {
    const { upload, calls } = fakeUploader()
    const writes = await uploadSkillWrites(
      [
        { name: '清单A', file: 'skills/x.zip' },
        { name: '清单B', file: 'skills/x.zip' },
      ],
      skillFiles,
      upload
    )
    expect(calls).toEqual(['清单A', '清单B'])
    expect(writes.map((w) => w.upload_object_key)).toEqual(['k-1', 'k-2'])
    expect(writes.map((w) => w.name)).toEqual(['清单A', '清单B'])
  })

  it('passes name-only skills through without uploading', async () => {
    const { upload, calls } = fakeUploader()
    const writes = await uploadSkillWrites([{ name: 'solo' }], skillFiles, upload)
    expect(calls).toEqual([])
    expect(writes).toEqual([{ name: 'solo' }])
  })
})

describe('uploadSquadSkillWrites', () => {
  it('uploads per member reference, even across members sharing one package', async () => {
    const { upload, calls } = fakeUploader()
    const s = squad()
    s.members[1].skills = [{ name: '清单A', file: 'skills/x.zip' }]
    const memberSkills = await uploadSquadSkillWrites(s, skillFiles, upload)
    expect(calls).toHaveLength(2)
    expect(memberSkills.get('l')![0].upload_object_key).toBe('k-1')
    expect(memberSkills.get('m')![0].upload_object_key).toBe('k-2')
  })
})

describe('buildExpertParams / buildSquadParams', () => {
  it('embeds resolved skills and applies meta overrides', () => {
    const params = buildExpertParams(expert([]), [{ name: 'solo' }], {
      category: '数据洞察',
      tags: ['override'],
    })
    expect(params.skills).toEqual([{ name: 'solo' }])
    expect(params.category).toBe('数据洞察')
    expect(params.tags).toEqual(['override'])
  })

  it('falls back to the manifest category/tags when no override', () => {
    const params = buildExpertParams(expert([]), [])
    expect(params.category).toBe('研发工具')
    expect(params.tags).toEqual(['t'])
  })

  it('resolves each member’s skills from the per-member map', () => {
    const memberSkills = new Map<string, SkillWrite[]>([
      ['l', [{ name: '清单A', upload_object_key: 'k-1', file_name: 'x.zip', file_size: 3 }]],
      ['m', []],
    ])
    const params = buildSquadParams(squad(), memberSkills)
    expect(params.members[0].skills).toEqual(memberSkills.get('l'))
    expect(params.members[1].skills).toEqual([])
    expect(params.leader).toBe('L')
  })
})

describe('patch builders omit undeclared fields', () => {
  it('buildExpertPatch drops empty category/tags (present-but-empty clears server-side)', () => {
    const m = expert([])
    m.category = ''
    m.tags = []
    const p = buildExpertPatch(m, [])
    expect('category' in p).toBe(false)
    expect('tags' in p).toBe(false)
    expect(p.name).toBe('e')
    expect(p.skills).toEqual([])
  })

  it('buildExpertPatch keeps declared category/tags', () => {
    const p = buildExpertPatch(expert([]), [])
    expect(p.category).toBe('研发工具')
    expect(p.tags).toEqual(['t'])
  })

  it('buildSquadPatch drops empty tags/strategies/dependencies/permission but keeps members', () => {
    const s = squad({ category: '', strategies: [], permission: '' })
    const p = buildSquadPatch(s, new Map())
    expect('category' in p).toBe(false)
    expect('tags' in p).toBe(false)
    expect('strategies' in p).toBe(false)
    expect('dependencies' in p).toBe(false)
    expect('permission' in p).toBe(false)
    expect(p.members).toHaveLength(2)
    expect(p.leader).toBe('L')
  })

  it('buildSquadPatch keeps declared squad-only fields', () => {
    const s = squad({ permission: '读写', dependencies: { blocking: ['git'], recommended: [] } })
    const p = buildSquadPatch(s, new Map())
    expect(p.strategies).toEqual(['a'])
    expect(p.permission).toBe('读写')
    expect(p.dependencies).toEqual({ blocking: ['git'], recommended: [] })
  })
})
