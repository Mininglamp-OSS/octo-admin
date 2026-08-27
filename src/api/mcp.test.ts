import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())
const mockPost = vi.hoisted(() => vi.fn())
const mockPatch = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())
const mockUseAuthStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({ token: 'token-1', logout: vi.fn() })),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      patch: mockPatch,
      delete: mockDelete,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}))

vi.mock('../store/auth', () => ({ useAuthStore: mockUseAuthStore }))
vi.mock('../i18n', () => ({
  default: { resolvedLanguage: 'zh-CN' },
  FALLBACK_LANGUAGE: 'zh-CN',
}))

import {
  createMcpCategory,
  createSystemMcp,
  deleteMcpCategory,
  listMcpCategories,
  updateMcpCategory,
  getSystemMcp,
  listSystemMcps,
  updateSystemMcp,
  slugifyServerName,
  extractPluginId,
  DEFAULT_SERVER_SLUG,
} from './mcp'

beforeEach(() => {
  mockGet.mockReset()
  mockPost.mockReset()
  mockPatch.mockReset()
  mockDelete.mockReset()
})

describe('mcp category CRUD — unified /admin/plugin_categories surface', () => {
  it('lists connector categories and maps the unified wire to McpCategory', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            category_id: 'c-dev',
            name: 'dev',
            icon_key: 'wrench',
            plugin_types: ['connector'],
            sort_order: 2,
            plugin_count: 5,
          },
        ],
      },
    })

    const rows = await listMcpCategories()

    expect(mockGet).toHaveBeenCalledWith('/admin/plugin_categories', {
      params: { plugin_type: 'connector' },
    })
    expect(rows).toEqual([
      {
        mcp_category_id: 'c-dev',
        name: 'dev',
        icon_key: 'wrench',
        sort_order: 2,
        count: 5,
        plugin_types: ['connector'],
      },
    ])
  })

  it('creates a category with the connector plugin type', async () => {
    mockPost.mockResolvedValue({
      data: { data: { category_id: 'c-new', name: '新分类', sort_order: 3 } },
    })

    const created = await createMcpCategory({ name: '新分类', sort_order: 3 })

    expect(mockPost).toHaveBeenCalledWith('/admin/plugin_categories', {
      name: '新分类',
      icon_key: '',
      plugin_types: ['connector'],
      sort_order: 3,
    })
    expect(created).toEqual({
      mcp_category_id: 'c-new',
      name: '新分类',
      icon_key: undefined,
      sort_order: 3,
      count: undefined,
    })
  })

  it('updates a category, echoing icon_key and the connector plugin type', async () => {
    mockPatch.mockResolvedValue({
      data: { data: { category_id: 'c-dev', name: '改名', icon_key: 'wrench', sort_order: 1 } },
    })

    const updated = await updateMcpCategory('c-dev', {
      name: '改名',
      icon_key: 'wrench',
      sort_order: 1,
    })

    expect(mockPatch).toHaveBeenCalledWith('/admin/plugin_categories/c-dev', {
      name: '改名',
      icon_key: 'wrench',
      plugin_types: ['connector'],
      sort_order: 1,
    })
    expect(updated.mcp_category_id).toBe('c-dev')
    expect(updated.name).toBe('改名')
  })

  it('echoes the row existing plugin_types on update so a shared category is not narrowed (review P2-2)', async () => {
    mockPatch.mockResolvedValue({
      data: { data: { category_id: 'c-dev', name: '改名', sort_order: 1 } },
    })

    await updateMcpCategory('c-dev', {
      name: '改名',
      icon_key: 'wrench',
      sort_order: 1,
      // A category shared by connector + skill: renaming it from the connector
      // tab must keep BOTH types, not overwrite with ['connector'].
      plugin_types: ['connector', 'skill'],
    })

    expect(mockPatch).toHaveBeenCalledWith('/admin/plugin_categories/c-dev', {
      name: '改名',
      icon_key: 'wrench',
      plugin_types: ['connector', 'skill'],
      sort_order: 1,
    })
  })

  it('falls back to the connector-only plugin_types when the caller omits them', async () => {
    mockPatch.mockResolvedValue({
      data: { data: { category_id: 'c-dev', name: '改名', sort_order: 1 } },
    })

    await updateMcpCategory('c-dev', { name: '改名', sort_order: 1 })

    const body = mockPatch.mock.calls[0][1] as { plugin_types: string[] }
    expect(body.plugin_types).toEqual(['connector'])
  })

  it('deletes a category via the unified route', async () => {
    mockDelete.mockResolvedValue({ data: { data: {} } })

    await deleteMcpCategory('c-dev')

    expect(mockDelete).toHaveBeenCalledWith('/admin/plugin_categories/c-dev')
  })
})

describe('slugifyServerName — octo-web parity', () => {
  it('drops underscores rather than hyphenating them (differs from the form slug)', () => {
    // octo-web replaces only \s+, so "_" falls through to the strip step and
    // is removed — "my_server" → "myserver", NOT "my-server".
    expect(slugifyServerName('my_server')).toBe('myserver')
  })

  it('falls back to DEFAULT_SERVER_SLUG for a pure-CJK name', () => {
    expect(slugifyServerName('高德地图')).toBe(DEFAULT_SERVER_SLUG)
    expect(slugifyServerName('高德地图')).toBe('mcp-server')
  })

  it('lowercases, hyphenates whitespace and collapses/edges for a normal name', () => {
    expect(slugifyServerName('  My Cool  Server ')).toBe('my-cool-server')
  })
})

describe('connector category lookup — loud on an unresolved category (review P1)', () => {
  const CONNECTOR_CATS = {
    data: { data: [{ category_id: 'c-dev', name: 'dev', plugin_types: ['connector'] }] },
  }

  it('createSystemMcp throws category_not_found instead of silently omitting category_id', async () => {
    mockGet.mockResolvedValue(CONNECTOR_CATS)
    mockPost.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'mcp-x' } } } })

    await expect(
      createSystemMcp({
        name: 'X',
        // A category created in the new tab that isn't in this map (or a renamed
        // seeded one) must fail loud, not write category_id=NULL.
        category: '不存在的分类',
        transport: 'streamable-http',
        url: 'https://x/mcp',
        tools: [],
      })
    ).rejects.toMatchObject({ code: 'category_not_found' })
    // Never reached the create POST with a NULL category.
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('createSystemMcp resolves a known category name to its id', async () => {
    mockGet.mockResolvedValue(CONNECTOR_CATS)
    mockPost.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'mcp-x' } } } })
    // The follow-up loadMcpDetail GET also hits mockGet → returns the category
    // list shape, which mapMcpDetail tolerates (no plugin key → empty detail).
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATS)
        : Promise.resolve({ data: { data: { plugin: { plugin_id: 'mcp-x', plugin_name: 'X', plugin_type: 'connector', plugin_json: { attachments: [] } }, relations: [] } } })
    )

    await createSystemMcp({
      name: 'X',
      category: 'dev',
      transport: 'streamable-http',
      url: 'https://x/mcp',
      tools: [],
    })

    const body = mockPost.mock.calls[0][1] as { plugin: { category_id?: string } }
    expect(body.plugin.category_id).toBe('c-dev')
  })

  it('createSystemMcp omits category_id (no throw) for an empty category', async () => {
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATS)
        : Promise.resolve({ data: { data: { plugin: { plugin_id: 'mcp-x', plugin_name: 'X', plugin_type: 'connector', plugin_json: { attachments: [] } }, relations: [] } } })
    )
    mockPost.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'mcp-x' } } } })

    await createSystemMcp({
      name: 'X',
      category: '',
      transport: 'streamable-http',
      url: 'https://x/mcp',
      tools: [],
    })

    const body = mockPost.mock.calls[0][1] as { plugin: { category_id?: string } }
    expect(body.plugin.category_id).toBeUndefined()
  })
})

describe('extractPluginId', () => {
  it('reads the nested {plugin:{plugin_id}} envelope', () => {
    expect(extractPluginId({ plugin: { plugin_id: 'p-1' } })).toBe('p-1')
  })

  it('reads a bare {plugin_id} envelope', () => {
    expect(extractPluginId({ plugin_id: 'p-2' })).toBe('p-2')
  })

  it('throws a clean create-failed error on an empty id instead of failing open', () => {
    expect(() => extractPluginId({})).toThrowError(/plugin id/i)
    expect(() => extractPluginId(null)).toThrowError(/plugin id/i)
    expect(() => extractPluginId({ plugin: { plugin_id: '' } })).toThrowError(
      /plugin id/i
    )
  })
})

// The connector translation core (map + upsert) shipped untested; these cover
// the icon/publisher round-trip the review flagged.
const CONNECTOR_CATEGORIES = {
  data: { data: [{ category_id: 'c-dev', name: 'dev', plugin_types: ['connector'] }] },
}

function connectorDetailWire() {
  return {
    data: {
      data: {
        plugin: {
          plugin_id: 'mcp-1',
          plugin_name: 'My Connector',
          plugin_type: 'connector',
          manifest_json: {
            name: 'my-connector',
            description: 'A slogan',
            labels: ['t1'],
          },
          category_id: 'c-dev',
          // Canonical object key vs. resolved 1h presigned display URL.
          icon: 'icons/mcp-1/logo.png',
          icon_url: 'https://presigned.example/mcp-1?exp=1h',
          publisher: 'Ops Team',
          visibility: 'system',
          tags: ['t1'],
          plugin_json: {
            attachments: [
              {
                path: 'mcp.json',
                content_type: 'raw',
                raw_content: JSON.stringify({
                  mcpServers: {
                    'My Connector': {
                      type: 'streamable-http',
                      url: 'https://remote.example/mcp',
                    },
                  },
                }),
              },
            ],
          },
        },
        relations: [],
      },
    },
  }
}

describe('MCP icon/publisher round-trip through the translation layer', () => {
  beforeEach(() => {
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATEGORIES)
        : Promise.resolve(connectorDetailWire())
    )
  })

  it('maps the canonical icon and the display icon_url onto SEPARATE fields on read', async () => {
    const detail = await getSystemMcp('mcp-1')
    expect(detail.icon).toBe('icons/mcp-1/logo.png')
    expect(detail.icon_url).toBe('https://presigned.example/mcp-1?exp=1h')
    expect(detail.publisher).toBe('Ops Team')
  })

  it('sends the canonical icon and existing publisher on update — never the presigned icon_url', async () => {
    mockPatch.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'mcp-1' } } } })

    await updateSystemMcp('mcp-1', {
      name: 'My Connector',
      category: 'dev',
      // The form seeds this from the canonical icon, not icon_url.
      icon: 'icons/mcp-1/logo.png',
      publisher: 'Ops Team',
      transport: 'streamable-http',
      url: 'https://remote.example/mcp',
      tools: [],
    })

    const body = mockPatch.mock.calls[0][1] as {
      plugin: { icon: string; publisher?: string }
    }
    expect(body.plugin.icon).toBe('icons/mcp-1/logo.png')
    expect(body.plugin.icon).not.toContain('presigned')
    expect(body.plugin.publisher).toBe('Ops Team')
  })
})

// ── Server-identity + multi-server preservation (review B / C) ──────────────

interface UpsertBody {
  plugin: {
    visibility: string
    plugin_json: {
      connector: { source: string }
      attachments: { path: string; raw_content: string }[]
    }
  }
}

function writtenMcpServers(body: UpsertBody): Record<string, unknown> {
  const att = body.plugin.plugin_json.attachments.find((a) => a.path === 'mcp.json')
  return (JSON.parse(att!.raw_content) as { mcpServers: Record<string, unknown> })
    .mcpServers
}

function connectorDetailWireWith(plugin: Record<string, unknown>) {
  return { data: { data: { plugin, relations: [] } } }
}

describe('connector server identity — stored key round-trip (review B)', () => {
  it('preserves a stored mcpServers key that differs from the display name instead of re-keying by it', async () => {
    // Stored key `jira-server` ≠ display name `My Connector`; slug (manifest
    // machine name) also `jira-server`, matching a backend-minted row.
    const wire = connectorDetailWireWith({
      plugin_id: 'mcp-9',
      plugin_name: 'My Connector',
      plugin_type: 'connector',
      manifest_json: { name: 'jira-server', description: 's', labels: [] },
      category_id: 'c-dev',
      icon: '',
      visibility: 'system',
      tags: [],
      plugin_json: {
        attachments: [
          {
            path: 'mcp.json',
            content_type: 'raw',
            raw_content: JSON.stringify({
              mcpServers: {
                'jira-server': {
                  type: 'streamable-http',
                  url: 'https://remote.example/mcp',
                },
              },
            }),
          },
        ],
      },
    })
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATEGORIES)
        : Promise.resolve(wire)
    )
    mockPatch.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'mcp-9' } } } })

    const detail = await getSystemMcp('mcp-9')
    // Read exposes the VERBATIM stored key.
    expect(detail.quick_start.server_name).toBe('jira-server')

    // Thread the read values back the way FormModal does.
    await updateSystemMcp('mcp-9', {
      name: detail.name,
      slug: detail.quick_start.slug,
      server_name: detail.quick_start.server_name,
      extra_servers: detail.quick_start.extra_servers,
      category: 'dev',
      transport: detail.quick_start.transport,
      url: detail.quick_start.url,
      tools: [],
    })

    const body = mockPatch.mock.calls[0][1] as UpsertBody
    const servers = writtenMcpServers(body)
    expect(Object.keys(servers)).toEqual(['jira-server'])
    // The display name must never become a server key (the bug this fixes).
    expect(servers['My Connector']).toBeUndefined()
    expect(body.plugin.plugin_json.connector.source).toBe('connector.jira-server')
  })
})

describe('connector server selection — models the named server (review P1-4)', () => {
  it('selects the mcpServers entry named by connector.source, not the first-sorted key', async () => {
    const wire = connectorDetailWireWith({
      plugin_id: 'mcp-11',
      plugin_name: 'Multi',
      plugin_type: 'connector',
      // manifest.name matches NO server key, so selection must fall through to
      // connector.source rather than grabbing the first-sorted key.
      manifest_json: { name: 'unrelated', description: '', labels: [] },
      category_id: 'c-dev',
      icon: '',
      visibility: 'system',
      tags: [],
      plugin_json: {
        connector: { type: 'mcp', source: 'connector.secondary' },
        attachments: [
          {
            path: 'mcp.json',
            content_type: 'raw',
            raw_content: JSON.stringify({
              mcpServers: {
                alpha: {
                  type: 'streamable-http',
                  url: 'https://alpha.example/mcp',
                },
                secondary: { type: 'stdio', command: 'run', args: ['--x'] },
              },
            }),
          },
        ],
      },
    })
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATEGORIES)
        : Promise.resolve(wire)
    )

    const detail = await getSystemMcp('mcp-11')
    // The record names `secondary` via connector.source; it is the modeled
    // server even though `alpha` is the first-sorted key. `alpha` is retained
    // aside as an extra server.
    expect(detail.quick_start.server_name).toBe('secondary')
    expect(detail.quick_start.transport).toBe('stdio')
    expect(detail.quick_start.command).toBe('run')
    expect(detail.quick_start.extra_servers).toEqual({
      alpha: { type: 'streamable-http', url: 'https://alpha.example/mcp' },
    })
  })
})

describe('connector multi-server preservation (review C safeguard)', () => {
  it('round-trips every server through read→write, never collapsing to the first', async () => {
    const wire = connectorDetailWireWith({
      plugin_id: 'mcp-10',
      plugin_name: 'Multi',
      plugin_type: 'connector',
      manifest_json: { name: 'primary', description: '', labels: [] },
      category_id: 'c-dev',
      icon: '',
      visibility: 'system',
      tags: [],
      plugin_json: {
        attachments: [
          {
            path: 'mcp.json',
            content_type: 'raw',
            raw_content: JSON.stringify({
              mcpServers: {
                primary: { type: 'streamable-http', url: 'https://a.example/mcp' },
                secondary: { type: 'stdio', command: 'run', args: ['--x'] },
              },
            }),
          },
        ],
      },
    })
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATEGORIES)
        : Promise.resolve(wire)
    )
    mockPatch.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'mcp-10' } } } })

    const detail = await getSystemMcp('mcp-10')
    // The modeled server is the first; the extra one is retained aside.
    expect(detail.quick_start.server_name).toBe('primary')
    expect(detail.quick_start.extra_servers).toEqual({
      secondary: { type: 'stdio', command: 'run', args: ['--x'] },
    })

    await updateSystemMcp('mcp-10', {
      name: detail.name,
      slug: detail.quick_start.slug,
      server_name: detail.quick_start.server_name,
      extra_servers: detail.quick_start.extra_servers,
      category: 'dev',
      transport: detail.quick_start.transport,
      url: detail.quick_start.url,
      tools: [],
    })

    const servers = writtenMcpServers(mockPatch.mock.calls[0][1] as UpsertBody)
    expect(Object.keys(servers).sort()).toEqual(['primary', 'secondary'])
    // The unmodeled server survives byte-for-byte.
    expect(servers.secondary).toEqual({ type: 'stdio', command: 'run', args: ['--x'] })
    expect(servers.primary).toEqual({
      type: 'streamable-http',
      url: 'https://a.example/mcp',
    })
  })
})

describe('connector identity anchoring — source/name/key agree, no flip (review P1-A)', () => {
  it('anchors connector.source, manifest.name and the server key to the stored map key when slug differs, and round-trips a preserved extra server without flipping the modeled server', async () => {
    // A backend-minted record where the stored server key `jira-server` differs
    // from the manifest machine slug `the-slug`, plus an UNMODELED extra server
    // `extra` that sorts BEFORE the modeled key (so a re-slugify bug would flip
    // the read to `extra`). connector.source names the real server.
    const wire = connectorDetailWireWith({
      plugin_id: 'mcp-12',
      plugin_name: 'My Connector',
      plugin_type: 'connector',
      manifest_json: { name: 'the-slug', description: 's', labels: [] },
      category_id: 'c-dev',
      icon: '',
      visibility: 'system',
      tags: [],
      plugin_json: {
        connector: { type: 'mcp', source: 'connector.jira-server' },
        attachments: [
          {
            path: 'mcp.json',
            content_type: 'raw',
            raw_content: JSON.stringify({
              mcpServers: {
                extra: { type: 'stdio', command: 'run', args: ['--x'] },
                'jira-server': {
                  type: 'streamable-http',
                  url: 'https://jira.example/mcp',
                },
              },
            }),
          },
        ],
      },
    })
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATEGORIES)
        : Promise.resolve(wire)
    )
    mockPatch.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'mcp-12' } } } })

    const detail = await getSystemMcp('mcp-12')
    // Read selects the source-named server, exposes its verbatim key, and keeps
    // the slug (manifest machine name) distinct from the server key.
    expect(detail.quick_start.server_name).toBe('jira-server')
    expect(detail.quick_start.slug).toBe('the-slug')
    expect(detail.quick_start.extra_servers).toEqual({
      extra: { type: 'stdio', command: 'run', args: ['--x'] },
    })

    // Thread the read values back exactly as FormModal.buildPayload does.
    await updateSystemMcp('mcp-12', {
      name: detail.name,
      slug: detail.quick_start.slug,
      server_name: detail.quick_start.server_name,
      extra_servers: detail.quick_start.extra_servers,
      category: 'dev',
      transport: detail.quick_start.transport,
      url: detail.quick_start.url,
      tools: [],
    })

    const body = mockPatch.mock.calls[0][1] as UpsertBody & {
      plugin: { plugin_name: string; manifest_json: { name?: string } }
    }
    const servers = writtenMcpServers(body)
    // connector.source + the server key reference the stored key; manifest.name
    // stays the SLUG (the machine name) — it is NOT hijacked to the server key.
    expect(body.plugin.plugin_json.connector.source).toBe('connector.jira-server')
    expect(body.plugin.manifest_json.name).toBe('the-slug')
    expect(servers['jira-server']).toBeDefined()
    // The display name never leaks into the server map or the source.
    expect(servers['My Connector']).toBeUndefined()
    expect(body.plugin.plugin_json.connector.source).not.toContain('My Connector')
    // The extra server survives byte-for-byte alongside the modeled one.
    expect(Object.keys(servers).sort()).toEqual(['extra', 'jira-server'])
    expect(servers.extra).toEqual({ type: 'stdio', command: 'run', args: ['--x'] })

    // Feed the WRITTEN document back through the read: the modeled server must
    // stay `jira-server` (selected via connector.source) and never flip to the
    // first-sorted `extra`; the slug round-trips as the slug, not the server key.
    const writtenWire = connectorDetailWireWith({
      plugin_id: 'mcp-12',
      plugin_name: body.plugin.plugin_name,
      plugin_type: 'connector',
      manifest_json: body.plugin.manifest_json,
      category_id: 'c-dev',
      icon: '',
      visibility: 'system',
      tags: [],
      plugin_json: body.plugin.plugin_json,
    })
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATEGORIES)
        : Promise.resolve(writtenWire)
    )
    const reread = await getSystemMcp('mcp-12')
    expect(reread.quick_start.server_name).toBe('jira-server')
    expect(reread.quick_start.slug).toBe('the-slug')
    expect(reread.quick_start.extra_servers).toEqual({
      extra: { type: 'stdio', command: 'run', args: ['--x'] },
    })
  })
})

describe('connector list — tags normalization (crash guard)', () => {
  it('coerces string-encoded tags to an array so the page never maps a bare String', async () => {
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATEGORIES)
        : Promise.resolve({
            data: {
              data: [
                {
                  plugin_id: 'mcp-1',
                  plugin_name: 'X',
                  plugin_type: 'connector',
                  tags: JSON.stringify(['a', 'b']),
                },
              ],
              pagination: { total: 1, page: 1, page_size: 20 },
            },
          })
    )

    const res = await listSystemMcps()
    expect(res.items[0].tags).toEqual(['a', 'b'])
  })
})

describe('connector update — visibility is not widened (review)', () => {
  it('echoes the row existing space visibility instead of hard-coding system', async () => {
    const spaceWire = connectorDetailWireWith({
      plugin_id: 'mcp-s',
      plugin_name: 'S',
      plugin_type: 'connector',
      manifest_json: { name: 's', description: '', labels: [] },
      category_id: 'c-dev',
      icon: '',
      visibility: 'space',
      space_id: 'sp-1',
      tags: [],
      plugin_json: {
        attachments: [
          {
            path: 'mcp.json',
            content_type: 'raw',
            raw_content: JSON.stringify({
              mcpServers: { s: { type: 'streamable-http', url: 'https://x/mcp' } },
            }),
          },
        ],
      },
    })
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(CONNECTOR_CATEGORIES)
        : Promise.resolve(spaceWire)
    )
    mockPatch.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'mcp-s' } } } })

    await updateSystemMcp('mcp-s', {
      name: 'S',
      category: 'dev',
      transport: 'streamable-http',
      url: 'https://x/mcp',
      tools: [],
    })

    const body = mockPatch.mock.calls[0][1] as UpsertBody
    expect(body.plugin.visibility).toBe('space')
    expect(body.plugin.visibility).not.toBe('system')
  })
})
