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
