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
  deleteMcpCategory,
  listMcpCategories,
  updateMcpCategory,
  getSystemMcp,
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
