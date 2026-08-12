/**
 * Coverage for the pure manifest validator (parseManifest) and the container
 * path-safety helper. These carry all the branchy correctness logic — required
 * fields, size caps, exactly-one-leader, and archive-safety — that a malformed
 * upload could otherwise sneak past. The JSZip I/O shell (parseExpertContainer)
 * is thin glue and left to manual verification.
 */

import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  ContainerError,
  isUnsafeEntryPath,
  parseExpertContainer,
  parseManifest,
  MAX_MCP_CONFIG_BYTES,
  type ParsedExpert,
  type ParsedSquad,
} from './parseContainer'

const validExpert = {
  name: '后端架构师',
  short_name: '架构',
  summary: '评审服务边界、数据模型和可靠性方案。',
  category: '研发工具',
  tags: ['架构评审', '可靠性'],
  instruction: '你是资深后端架构师……',
  mcp_config: '{"mcpServers":{}}',
  skills: [{ name: '架构评审清单', file: 'skills/checklist.zip' }],
}

function validSquad() {
  return {
    name: '增长小组',
    summary: '负责增长实验设计与执行。',
    category: '营销策划',
    leader: '组长',
    strategies: ['先由组长拆解任务'],
    dependencies: { blocking: [], recommended: ['数据看板'] },
    members: [
      { member_key: 'lead', name: '组长', role: 'leader', is_leader: true, instruction: '统筹', mcp_config: '{}' },
      { member_key: 'ic', name: '执行', role: 'ic', is_leader: false, instruction: '执行任务', mcp_config: '{}' },
    ],
  }
}

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    if (e instanceof ContainerError) return e.code
    throw e
  }
  throw new Error('expected ContainerError, none thrown')
}

describe('isUnsafeEntryPath', () => {
  it('accepts a plain relative path', () => {
    expect(isUnsafeEntryPath('skills/x.zip')).toBe(false)
  })
  it('rejects absolute, drive, traversal, and empty', () => {
    expect(isUnsafeEntryPath('/etc/passwd')).toBe(true)
    expect(isUnsafeEntryPath('C:/x.zip')).toBe(true)
    expect(isUnsafeEntryPath('skills/../../secret.zip')).toBe(true)
    expect(isUnsafeEntryPath('')).toBe(true)
  })
})

describe('parseManifest — expert', () => {
  it('normalizes a valid expert manifest', () => {
    const m = parseManifest('agent', validExpert) as ParsedExpert
    expect(m.kind).toBe('agent')
    expect(m.name).toBe('后端架构师')
    expect(m.short_name).toBe('架构')
    expect(m.skills).toEqual([{ name: '架构评审清单', file: 'skills/checklist.zip' }])
  })

  it('requires name, summary, instruction', () => {
    expect(code(() => parseManifest('agent', { ...validExpert, name: '' }))).toBe('nameRequired')
    expect(code(() => parseManifest('agent', { ...validExpert, summary: '  ' }))).toBe('summaryRequired')
    expect(code(() => parseManifest('agent', { ...validExpert, instruction: '' }))).toBe('instructionRequired')
  })

  it('defaults an omitted mcp_config to an empty server map', () => {
    const m = parseManifest('agent', { ...validExpert, mcp_config: undefined }) as ParsedExpert
    expect(JSON.parse(m.mcp_config)).toEqual({ mcpServers: {} })
  })

  it('rejects invalid and oversized mcp_config', () => {
    expect(code(() => parseManifest('agent', { ...validExpert, mcp_config: '{not json' }))).toBe('mcpConfigInvalid')
    const huge = '{"x":"' + 'a'.repeat(MAX_MCP_CONFIG_BYTES) + '"}'
    expect(code(() => parseManifest('agent', { ...validExpert, mcp_config: huge }))).toBe('mcpConfigTooLarge')
  })

  it('accepts a name-only skill and rejects unsafe / wrong-ext files', () => {
    const m = parseManifest('agent', { ...validExpert, skills: [{ name: '仅名称' }] }) as ParsedExpert
    expect(m.skills[0]).toEqual({ name: '仅名称' })
    expect(code(() => parseManifest('agent', { ...validExpert, skills: [{ name: 'x', file: '../evil.zip' }] }))).toBe('skillPathUnsafe')
    expect(code(() => parseManifest('agent', { ...validExpert, skills: [{ name: 'x', file: 'skills/x.txt' }] }))).toBe('skillExtInvalid')
    expect(code(() => parseManifest('agent', { ...validExpert, skills: [{ file: 'skills/x.zip' }] }))).toBe('skillNameRequired')
  })
})

describe('parseManifest — squad', () => {
  it('normalizes a valid squad manifest', () => {
    const m = parseManifest('squad', validSquad()) as ParsedSquad
    expect(m.kind).toBe('squad')
    expect(m.members).toHaveLength(2)
    expect(m.leader).toBe('组长')
    expect(m.dependencies.recommended).toEqual(['数据看板'])
  })

  it('requires at least one member', () => {
    expect(code(() => parseManifest('squad', { ...validSquad(), members: [] }))).toBe('membersRequired')
  })

  it('requires exactly one leader', () => {
    const two = validSquad()
    two.members[1].is_leader = true
    expect(code(() => parseManifest('squad', two))).toBe('leaderCount')
    const none = validSquad()
    none.members[0].is_leader = false
    expect(code(() => parseManifest('squad', none))).toBe('leaderCount')
  })

  it('falls back leader label to the leader member name when omitted', () => {
    const s = validSquad()
    delete (s as Record<string, unknown>).leader
    const m = parseManifest('squad', s) as ParsedSquad
    expect(m.leader).toBe('组长')
  })

  it('rejects duplicate member keys and missing member instruction', () => {
    const dup = validSquad()
    dup.members[1].member_key = 'lead'
    expect(code(() => parseManifest('squad', dup))).toBe('memberKeyDup')
    const noInstr = validSquad()
    noInstr.members[1].instruction = ''
    expect(code(() => parseManifest('squad', noInstr))).toBe('memberInstructionRequired')
  })

  it('rejects a member with an empty role (backend requires it)', () => {
    const noRole = validSquad()
    noRole.members[1].role = ''
    expect(code(() => parseManifest('squad', noRole))).toBe('memberRoleRequired')
  })
})

describe('parseManifest — shape guards', () => {
  it('rejects a non-object manifest', () => {
    expect(code(() => parseManifest('agent', null))).toBe('manifestInvalid')
    expect(code(() => parseManifest('agent', 'nope'))).toBe('manifestInvalid')
  })
})

async function buildZip(files: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return zip.generateAsync({ type: 'blob' })
}

async function codeAsync(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (e) {
    if (e instanceof ContainerError) return e.code
    throw e
  }
  throw new Error('expected ContainerError, none thrown')
}

describe('parseExpertContainer — real zip', () => {
  it('parses an expert container and resolves the bundled skill blob', async () => {
    const zip = await buildZip({
      'expert.json': JSON.stringify(validExpert),
      'skills/checklist.zip': new Uint8Array([1, 2, 3, 4]),
    })
    const parsed = await parseExpertContainer(zip)
    expect(parsed.manifest.kind).toBe('agent')
    expect(parsed.skillFiles.size).toBe(1)
    const file = parsed.skillFiles.get('skills/checklist.zip')!
    expect(file.fileName).toBe('checklist.zip')
    expect(file.skillName).toBe('架构评审清单')
    expect(file.blob.size).toBe(4)
  })

  it('parses a squad container', async () => {
    const zip = await buildZip({ 'squad.json': JSON.stringify(validSquad()) })
    const parsed = await parseExpertContainer(zip)
    expect(parsed.manifest.kind).toBe('squad')
    expect(parsed.skillFiles.size).toBe(0)
  })

  it('rejects a container with both manifests', async () => {
    const zip = await buildZip({
      'expert.json': JSON.stringify(validExpert),
      'squad.json': JSON.stringify(validSquad()),
    })
    expect(await codeAsync(() => parseExpertContainer(zip))).toBe('manifestAmbiguous')
  })

  it('rejects a container missing any manifest', async () => {
    const zip = await buildZip({ 'readme.txt': 'nope' })
    expect(await codeAsync(() => parseExpertContainer(zip))).toBe('manifestMissing')
  })

  it('rejects when a referenced skill file is absent', async () => {
    const zip = await buildZip({ 'expert.json': JSON.stringify(validExpert) })
    expect(await codeAsync(() => parseExpertContainer(zip))).toBe('skillFileMissing')
  })

  it('rejects a non-zip file', async () => {
    const notZip = new Blob([new Uint8Array([0, 1, 2, 3])])
    expect(await codeAsync(() => parseExpertContainer(notZip))).toBe('zipInvalid')
  })
})
