/**
 * Coverage for the pure manifest → create-request builders, in particular the
 * shared-package name-collision fix: two skills referencing the same bundled
 * file must each keep their own name while reusing one upload_object_key.
 */

import { describe, expect, it } from 'vitest'
import type { SkillWrite } from '../../api/expert'
import { buildExpertParams, buildSquadParams } from './submitContainer'
import type { ParsedExpert, ParsedSquad } from './parseContainer'

const uploaded = new Map<string, SkillWrite>([
  ['skills/x.zip', { name: '清单A', upload_object_key: 'k-x', file_name: 'x.zip', file_size: 10 }],
])

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

describe('buildExpertParams', () => {
  it('gives each skill sharing one package its own name + the shared key', () => {
    const params = buildExpertParams(
      expert([
        { name: '清单A', file: 'skills/x.zip' },
        { name: '清单B', file: 'skills/x.zip' },
      ]),
      uploaded
    )
    expect(params.skills).toEqual([
      { name: '清单A', upload_object_key: 'k-x', file_name: 'x.zip', file_size: 10 },
      { name: '清单B', upload_object_key: 'k-x', file_name: 'x.zip', file_size: 10 },
    ])
  })

  it('keeps name-only skills as name-only, and applies meta overrides', () => {
    const params = buildExpertParams(expert([{ name: 'solo' }]), new Map(), {
      category: '数据洞察',
      tags: ['override'],
    })
    expect(params.skills).toEqual([{ name: 'solo' }])
    expect(params.category).toBe('数据洞察')
    expect(params.tags).toEqual(['override'])
  })

  it('falls back to the manifest category/tags when no override', () => {
    const params = buildExpertParams(expert([]), new Map())
    expect(params.category).toBe('研发工具')
    expect(params.tags).toEqual(['t'])
  })
})

describe('buildSquadParams', () => {
  it('resolves each member’s skills independently', () => {
    const squad: ParsedSquad = {
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
    }
    const params = buildSquadParams(squad, uploaded)
    expect(params.members[0].skills).toEqual([
      { name: '清单A', upload_object_key: 'k-x', file_name: 'x.zip', file_size: 10 },
    ])
    expect(params.members[1].skills).toEqual([])
    expect(params.leader).toBe('L')
  })
})
