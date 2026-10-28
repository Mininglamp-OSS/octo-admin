import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { ContainerError } from './parseContainer'
import { detectReferencedContainer, parseReferencedManifest } from './parseReferencedContainer'

describe('parseReferencedManifest', () => {
  it('parses an expert with required pins', () => {
    const out = parseReferencedManifest(
      {
        schema_version: '2',
        kind: 'agent',
        name: '合同审查专家',
        instruction: '先看付款条款',
        skills: [{ id: 'skill-1', version_id: 'ver-1' }, { id: 'skill-2', version_id: 'ver-2' }],
        connectors: [{ id: 'connector-1' }],
      },
      'agent',
    )
    expect(out.kind).toBe('agent')
    if (out.kind !== 'agent') return
    expect(out.skills).toHaveLength(2)
    expect(out.skills[0].version_id).toBe('ver-1')
    expect(out.skills[1].version_id).toBe('ver-2')
  })

  it('rejects a skill without a released version pin', () => {
    expect(() =>
      parseReferencedManifest(
        { schema_version: '2', kind: 'agent', name: 'x', instruction: 'y', skills: [{ id: 's1' }] },
        'agent',
      ),
    ).toThrow(/version_id is required/)
  })

  it('rejects a connector carrying a version', () => {
    expect(() =>
      parseReferencedManifest(
        { schema_version: '2', kind: 'agent', name: 'x', instruction: 'y', connectors: [{ id: 'c', version_id: 'v' }] },
        'agent',
      ),
    ).toThrow(ContainerError)
  })

  it('rejects a team without exactly one leader', () => {
    expect(() =>
      parseReferencedManifest(
        {
          schema_version: '2',
          kind: 'squad',
          name: 't',
          instruction: 'y',
          members: [
            { id: 'e1', version_id: 'v1', member_key: 'a', role: 'r', is_leader: true },
            { id: 'e2', version_id: 'v2', member_key: 'b', role: 'r', is_leader: true },
          ],
        },
        'squad',
      ),
    ).toThrow(/leader/)
  })

  it('rejects the legacy schema', () => {
    expect(() => parseReferencedManifest({ schema_version: '1' }, 'agent')).toThrow(/schema_version/)
  })
})


async function makeZip(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

describe('detectReferencedContainer bounds', () => {
  it('rejects an oversized v2 manifest before parsing it', async () => {
    const manifest = JSON.stringify({
      schema_version: '2',
      kind: 'agent',
      name: 'big',
      instruction: 'x'.repeat(2 * 1024 * 1024),
    })
    await expect(detectReferencedContainer(await makeZip({ 'expert.json': manifest }))).rejects.toMatchObject({
      code: 'manifestTooLarge',
    })
  })

  it('rejects an oversized legacy manifest instead of falling back unbounded', async () => {
    const manifest = JSON.stringify({ name: 'legacy', instruction: 'x'.repeat(2 * 1024 * 1024) })
    await expect(detectReferencedContainer(await makeZip({ 'expert.json': manifest }))).rejects.toMatchObject({
      code: 'manifestTooLarge',
    })
  })

  it('rejects any extra entry next to a v2 manifest', async () => {
    const manifest = JSON.stringify({ schema_version: '2', kind: 'agent', name: 'x', instruction: 'y' })
    await expect(
      detectReferencedContainer(await makeZip({ 'expert.json': manifest, 'notes.txt': 'payload' })),
    ).rejects.toMatchObject({ code: 'embeddedPayload' })
  })

  it('rejects macOS metadata entries the backend would also reject', async () => {
    const manifest = JSON.stringify({ schema_version: '2', kind: 'agent', name: 'x', instruction: 'y' })
    await expect(
      detectReferencedContainer(
        await makeZip({ 'expert.json': manifest, '__MACOSX/._expert.json': 'junk', '.DS_Store': 'junk' }),
      ),
    ).rejects.toMatchObject({ code: 'embeddedPayload' })
  })
})


describe('v2 parser limits', () => {
  it('keeps a member version pin for the importer', () => {
    const out = parseReferencedManifest(
      {
        schema_version: '2',
        kind: 'squad',
        name: 't',
        instruction: 'y',
        members: [{ id: 'e1', member_key: 'a', role: 'r', is_leader: true, version_id: 'v1' }],
      },
      'squad',
    )
    if (out.kind !== 'squad') throw new Error('expected squad')
    expect(out.members[0].version_id).toBe('v1')
  })

  it('accepts tags on a squad manifest', () => {
    const out = parseReferencedManifest(
      {
        schema_version: '2',
        kind: 'squad',
        name: 't',
        tags: ['review'],
        instruction: 'y',
        members: [{ id: 'e1', version_id: 'v1', member_key: 'lead', role: 'leader', is_leader: true }],
      },
      'squad',
    )
    if (out.kind !== 'squad') throw new Error('expected squad')
    expect(out.tags).toEqual(['review'])
  })

  it('rejects a category field the backend decoder refuses', () => {
    expect(() =>
      parseReferencedManifest(
        { schema_version: '2', kind: 'agent', name: 'x', instruction: 'y', category: 'c', skills: [], connectors: [] },
        'agent',
      ),
    ).toThrow(/unknown field/)
  })

  it('rejects an over-long name before any upload', () => {
    expect(() =>
      parseReferencedManifest(
        { schema_version: '2', kind: 'agent', name: 'x'.repeat(129), instruction: 'y', skills: [], connectors: [] },
        'agent',
      ),
    ).toThrow(/name/i)
  })
})
