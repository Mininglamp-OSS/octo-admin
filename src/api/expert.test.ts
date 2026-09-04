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
  createExpertCategory,
  deleteExpertCategory,
  deleteSystemExpert,
  getSystemExpert,
  getSystemSquad,
  importExpertContainer,
  listExpertCategories,
  listSquadCategories,
  listSystemExperts,
  listSystemSquads,
  reuploadExpertContainer,
  reuploadSquadContainer,
  updateExpertCategory,
} from './expert'

// ─── Wire fixtures (unified plugin surface) ─────────────────────────────────

function rawAtt(path: string, content: string) {
  return { path, content_type: 'raw', mime_type: 'text/plain', raw_content: content }
}

/** Team AGENTS.md rendered exactly like plugindoc.TeamAgentsMarkdown so the
 *  client parser round-trips the structured squad fields. */
const teamAgents =
  '# 增长小组\n' +
  '\n负责增长实验设计与执行。\n' +
  '\n## 协作方式\n' +
  '\n- Leader: 组长\n' +
  '\n### 策略\n' +
  '1. 先由组长拆解任务\n' +
  '\n### 依赖\n' +
  '- 推荐: 数据看板\n' +
  '\n### 权限\n读写\n'

/** Dispatch a mocked GET by URL, returning the marketplace `{data: …}` axios
 *  envelope each function expects. */
function installGet(routes: Record<string, unknown>) {
  mockGet.mockImplementation((url: string) => {
    if (url in routes) return Promise.resolve({ data: routes[url] })
    throw new Error(`unexpected GET ${url}`)
  })
}

const expertCategories = { data: [{ category_id: 'c-dev', name: '研发工具' }] }
const teamCategories = { data: [{ category_id: 'c-mkt', name: '营销策划' }] }

beforeEach(() => {
  mockGet.mockReset()
  mockPost.mockReset()
  mockPatch.mockReset()
  mockDelete.mockReset()
})

// ─── Reads: expert mapping from plugin + relations ──────────────────────────

describe('getSystemExpert — maps the plugin graph back to ExpertDetail', () => {
  it('derives instruction/mcp_config from the package and skills from relations', async () => {
    installGet({
      '/admin/plugin_categories': expertCategories,
      '/admin/plugins/exp-1': {
        data: {
          plugin: {
            plugin_id: 'exp-1',
            plugin_name: '后端架构师',
            plugin_type: 'expert',
            category_id: 'c-dev',
            tags: ['架构评审'],
            visibility: 'system',
            creator_name: '管理员',
            manifest_json: { name: '后端架构师', description: '评审服务边界。' },
            plugin_json: {
              attachments: [
                rawAtt('AGENTS.md', '你是资深后端架构师……'),
                rawAtt('mcp.json', '{"mcpServers":{}}'),
              ],
            },
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
          },
          relations: [
            {
              relation_type: 'expert_skill',
              target_plugin_id: 'skill-1',
              sort_order: 0,
              data: { source_index: 0 },
            },
          ],
        },
      },
      '/admin/plugins/skill-1': {
        data: {
          plugin: {
            plugin_id: 'skill-1',
            plugin_name: '架构评审清单',
            plugin_type: 'skill',
            plugin_json: { attachments: [rawAtt('SKILL.md', '# 清单')] },
          },
          relations: [],
        },
      },
    })

    const detail = await getSystemExpert('exp-1')

    expect(detail.expert_id).toBe('exp-1')
    expect(detail.name).toBe('后端架构师')
    expect(detail.summary).toBe('评审服务边界。')
    expect(detail.category).toBe('研发工具') // category_id resolved to name
    expect(detail.tags).toEqual(['架构评审'])
    // A system wire value maps to the global 'system' scope.
    expect(detail.visibility).toBe('system')
    expect(detail.scope).toBe('system')
    expect(detail.instruction).toBe('你是资深后端架构师……')
    expect(detail.mcp_config).toBe('{"mcpServers":{}}')
    // The skill's SKILL.md rides along on the SkillRef (skill_md), so the drawer
    // renders the viewer client-side without a supporting skill_md fetch.
    expect(detail.skills).toEqual([
      {
        name: '架构评审清单',
        skill_plugin_id: 'skill-1',
        has_content: true,
        skill_md: '# 清单',
      },
    ])
    expect(detail.skill_count).toBe(1)
    // The SKILL.md text arrives inline on the skill relation target; no legacy
    // /admin/experts/{id}/skill_md supporting endpoint is ever called (the
    // strict GET router above would throw on any unexpected URL).
    const getUrls = mockGet.mock.calls.map((c) => c[0] as string)
    expect(getUrls.some((u) => u.includes('skill_md'))).toBe(false)
  })
})

describe('getSystemSquad — maps the team graph back to SquadDetail', () => {
  it('resolves members from relations and squad fields from the team AGENTS.md', async () => {
    installGet({
      '/admin/plugin_categories': teamCategories,
      '/admin/plugins/sq-1': {
        data: {
          plugin: {
            plugin_id: 'sq-1',
            plugin_name: '增长小组',
            plugin_type: 'expert_team',
            category_id: 'c-mkt',
            tags: [],
            visibility: 'system',
            creator_name: '管理员',
            manifest_json: { name: '增长小组', description: '负责增长实验设计与执行。' },
            plugin_json: { attachments: [rawAtt('AGENTS.md', teamAgents)] },
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
          },
          relations: [
            {
              relation_type: 'expert_team_expert',
              target_plugin_id: 'member-1',
              sort_order: 0,
              data: { member_key: 'lead', role: 'leader', is_leader: true, source_index: 0 },
            },
          ],
        },
      },
      '/admin/plugins/member-1': {
        data: {
          plugin: {
            plugin_id: 'member-1',
            plugin_name: '组长',
            plugin_type: 'expert',
            manifest_json: { name: '组长', description: 'leader' },
            plugin_json: {
              attachments: [
                rawAtt('AGENTS.md', '统筹全局'),
                rawAtt('mcp.json', '{"mcpServers":{}}'),
                rawAtt(
                  'expert/context.json',
                  '{"member_key":"lead","role":"leader","is_leader":true}'
                ),
              ],
            },
          },
          relations: [
            {
              relation_type: 'expert_skill',
              target_plugin_id: 'skill-2',
              sort_order: 0,
              data: {},
            },
          ],
        },
      },
      '/admin/plugins/skill-2': {
        data: {
          plugin: {
            plugin_id: 'skill-2',
            plugin_name: '增长清单',
            plugin_type: 'skill',
            plugin_json: { attachments: [rawAtt('SKILL.md', '# 增长')] },
          },
          relations: [],
        },
      },
    })

    const detail = await getSystemSquad('sq-1')

    expect(detail.squad_id).toBe('sq-1')
    expect(detail.category).toBe('营销策划')
    expect(detail.member_count).toBe(1)
    expect(detail.leader).toBe('组长')
    expect(detail.strategies).toEqual(['先由组长拆解任务'])
    expect(detail.dependencies).toEqual({ blocking: [], recommended: ['数据看板'] })
    expect(detail.permission).toBe('读写')
    expect(detail.members).toHaveLength(1)
    const [member] = detail.members
    expect(member).toMatchObject({
      member_key: 'lead',
      name: '组长',
      role: 'leader',
      is_leader: true,
      instruction: '统筹全局',
      mcp_config: '{"mcpServers":{}}',
    })
    expect(member.skills).toEqual([
      {
        name: '增长清单',
        skill_plugin_id: 'skill-2',
        has_content: true,
        skill_md: '# 增长',
      },
    ])
  })
})

describe('getSystemSquad — resolves members independently (review P1)', () => {
  it('still returns a detail with the other members when one member relation is un-resolvable', async () => {
    // Two member relations: member-1 resolves; member-bad's target GET is not in
    // the route table, so fetchPluginDetail rejects. The whole squad load must
    // NOT fail closed — the drawer still opens with the resolvable member.
    installGet({
      '/admin/plugin_categories': teamCategories,
      '/admin/plugins/sq-2': {
        data: {
          plugin: {
            plugin_id: 'sq-2',
            plugin_name: '增长小组',
            plugin_type: 'expert_team',
            category_id: 'c-mkt',
            tags: [],
            visibility: 'system',
            manifest_json: { name: '增长小组', description: '' },
            plugin_json: { attachments: [rawAtt('AGENTS.md', teamAgents)] },
          },
          relations: [
            {
              relation_type: 'expert_team_expert',
              target_plugin_id: 'member-1',
              sort_order: 0,
              data: { member_key: 'lead', role: 'leader', is_leader: true },
            },
            {
              // A soft-deleted member whose relation still points at it → 404.
              relation_type: 'expert_team_expert',
              target_plugin_id: 'member-bad',
              sort_order: 1,
              data: { member_key: 'gone', role: 'member', is_leader: false },
            },
          ],
        },
      },
      '/admin/plugins/member-1': {
        data: {
          plugin: {
            plugin_id: 'member-1',
            plugin_name: '组长',
            plugin_type: 'expert',
            manifest_json: { name: '组长', description: 'leader' },
            plugin_json: {
              attachments: [
                rawAtt('AGENTS.md', '统筹全局'),
                rawAtt('mcp.json', '{"mcpServers":{}}'),
              ],
            },
          },
          relations: [],
        },
      },
      // NOTE: '/admin/plugins/member-bad' is intentionally absent → rejects.
    })

    const detail = await getSystemSquad('sq-2')

    // The drawer opens with just the resolvable member; the bad one is dropped.
    expect(detail.members).toHaveLength(1)
    expect(detail.members[0].name).toBe('组长')
    expect(detail.member_count).toBe(1)
  })
})

describe('listSystemExperts — maps the unified list projection', () => {
  it('maps marketplace metrics without conflating missing values with a rating', async () => {
    installGet({
      '/admin/plugin_categories': expertCategories,
      '/admin/plugins': {
        data: [
          {
            plugin_id: 'exp-rated',
            plugin_name: 'Rated',
            plugin_type: 'expert',
            rating: 4,
            view_count: 12,
            install_count: 7,
            download_count: 3,
          },
          {
            plugin_id: 'exp-unrated',
            plugin_name: 'Unrated',
            plugin_type: 'expert',
          },
        ],
        pagination: { total: 2, page: 1, page_size: 20 },
      },
    })

    const { items } = await listSystemExperts()

    expect(items[0]).toMatchObject({
      rating: 4,
      view_count: 12,
      install_count: 7,
      download_count: 3,
    })
    expect(items[1]).toMatchObject({
      rating: null,
      view_count: 0,
      install_count: 0,
      download_count: 0,
    })
  })

  it('resolves category names and flattens pagination', async () => {
    installGet({
      '/admin/plugin_categories': expertCategories,
      '/admin/plugins': {
        data: [
          {
            plugin_id: 'exp-1',
            plugin_name: '后端架构师',
            plugin_type: 'expert',
            category_id: 'c-dev',
            tags: ['架构评审'],
            visibility: 'system',
            creator_name: '管理员',
            manifest_json: { name: '后端架构师', description: '评审服务边界。' },
          },
        ],
        pagination: { total: 1, page: 1, page_size: 20 },
      },
    })

    const resp = await listSystemExperts({ keyword: '架构', limit: 20, offset: 0 })

    expect(resp.total).toBe(1)
    expect(resp.items[0]).toMatchObject({
      expert_id: 'exp-1',
      name: '后端架构师',
      category: '研发工具',
      summary: '评审服务边界。',
      visibility: 'system',
      scope: 'system',
    })
    // The unified list endpoint pages by number, not limit/offset.
    expect(mockGet).toHaveBeenCalledWith('/admin/plugins', {
      params: { plugin_type: 'expert', q: '架构', page_size: 20, page: 1 },
    })
  })
})

describe('listSystemSquads — maps marketplace metrics', () => {
  it('preserves supplied metrics and defaults omitted fields', async () => {
    installGet({
      '/admin/plugin_categories': teamCategories,
      '/admin/plugins': {
        data: [
          {
            plugin_id: 'sq-rated',
            plugin_name: 'Rated squad',
            plugin_type: 'expert_team',
            rating: 3,
            view_count: 21,
            install_count: 8,
            download_count: 5,
          },
          {
            plugin_id: 'sq-unrated',
            plugin_name: 'Unrated squad',
            plugin_type: 'expert_team',
          },
        ],
        pagination: { total: 2, page: 1, page_size: 20 },
      },
    })

    const { items } = await listSystemSquads()

    expect(items[0]).toMatchObject({
      rating: 3,
      view_count: 21,
      install_count: 8,
      download_count: 5,
    })
    expect(items[1]).toMatchObject({
      rating: null,
      view_count: 0,
      install_count: 0,
      download_count: 0,
    })
  })
})

describe('deleteSystemExpert — targets the unified plugin route', () => {
  it('DELETEs /admin/plugins/{id}', async () => {
    mockDelete.mockResolvedValue({ data: { data: { plugin_id: 'exp-1', deleted: true } } })
    await deleteSystemExpert('exp-1')
    expect(mockDelete).toHaveBeenCalledWith('/admin/plugins/exp-1')
  })
})

// ─── Writes: server-side container import ────────────────────────────────────

describe('importExpertContainer — uploads the whole zip to the importer', () => {
  it('POSTs multipart file + resolved category_id to /admin/plugins/import', async () => {
    installGet({ '/admin/plugin_categories': expertCategories })
    mockPost.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'exp-9' } } } })
    const zip = new File([new Uint8Array([1, 2, 3])], 'expert.zip', {
      type: 'application/zip',
    })

    const result = await importExpertContainer(zip, {
      kind: 'agent',
      categoryName: '研发工具',
    })

    expect(result).toEqual({ plugin_id: 'exp-9' })
    // Category name resolved via the expert taxonomy.
    expect(mockGet).toHaveBeenCalledWith('/admin/plugin_categories', {
      params: { plugin_type: 'expert' },
    })
    const [url, form, config] = mockPost.mock.calls[0]
    expect(url).toBe('/admin/plugins/import')
    expect(form).toBeInstanceOf(FormData)
    expect((form as FormData).get('file')).toBeInstanceOf(File)
    expect(((form as FormData).get('file') as File).name).toBe('expert.zip')
    expect((form as FormData).get('category_id')).toBe('c-dev')
    expect(config).toMatchObject({ signal: undefined })
  })

  it('throws loudly (category_not_found) when a non-empty category cannot be resolved', async () => {
    installGet({ '/admin/plugin_categories': teamCategories })
    mockPost.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'sq-9' } } } })
    const zip = new File([new Uint8Array([1])], 'squad.zip')

    // A non-empty manifest/selected category that isn't in the taxonomy must
    // surface loudly instead of importing uncategorized with no signal.
    await expect(
      importExpertContainer(zip, { kind: 'squad', categoryName: '不存在' })
    ).rejects.toMatchObject({ code: 'category_not_found' })

    expect(mockGet).toHaveBeenCalledWith('/admin/plugin_categories', {
      params: { plugin_type: 'expert_team' },
    })
    // The import never fired with an uncategorized fallback.
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('skips the taxonomy lookup entirely when no category is given', async () => {
    mockPost.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'exp-10' } } } })
    const zip = new File([new Uint8Array([1])], 'expert.zip')

    await importExpertContainer(zip, { kind: 'agent' })

    expect(mockGet).not.toHaveBeenCalled()
    const [, form] = mockPost.mock.calls[0]
    expect((form as FormData).get('category_id')).toBeNull()
    expect((form as FormData).get('file')).toBeInstanceOf(File)
  })
})

describe('squad category taxonomy — dropdown lists what import resolves against (review P1-2)', () => {
  it('listSquadCategories lists the expert_team taxonomy, not the expert one', async () => {
    installGet({ '/admin/plugin_categories': teamCategories })

    const rows = await listSquadCategories()

    expect(mockGet).toHaveBeenCalledWith('/admin/plugin_categories', {
      params: { plugin_type: 'expert_team' },
    })
    expect(rows).toEqual([
      expect.objectContaining({ expert_category_id: 'c-mkt', name: '营销策划' }),
    ])
  })

  it('a squad import with an expert_team-resolvable category succeeds (no category_not_found block)', async () => {
    // The category the squad dropdown offers comes from listSquadCategories
    // (expert_team). Importing with it must resolve against the SAME expert_team
    // taxonomy and succeed — not blow up with the round-5 loud category_not_found
    // the expert/expert_team mismatch used to cause.
    installGet({ '/admin/plugin_categories': teamCategories })
    mockPost.mockResolvedValue({ data: { data: { plugin: { plugin_id: 'sq-11' } } } })
    const zip = new File([new Uint8Array([1, 2, 3])], 'squad.zip', {
      type: 'application/zip',
    })

    const result = await importExpertContainer(zip, {
      kind: 'squad',
      categoryName: '营销策划',
    })

    expect(result).toEqual({ plugin_id: 'sq-11' })
    expect(mockGet).toHaveBeenCalledWith('/admin/plugin_categories', {
      params: { plugin_type: 'expert_team' },
    })
    const [url, form] = mockPost.mock.calls[0]
    expect(url).toBe('/admin/plugins/import')
    expect((form as FormData).get('category_id')).toBe('c-mkt')
    expect((form as FormData).get('file')).toBeInstanceOf(File)
  })
})

describe('reuploadExpertContainer / reuploadSquadContainer — rebuild in place', () => {
  it('POSTs the raw zip + resolved category_id to container_reupload/{id} (expert)', async () => {
    installGet({ '/admin/plugin_categories': expertCategories })
    mockPost.mockResolvedValue({
      data: { data: { plugin: { plugin_id: 'exp-1' }, relations: [] } },
    })
    const zip = new File([new Uint8Array([1, 2, 3])], 'expert.zip', { type: 'application/zip' })

    await reuploadExpertContainer('exp-1', zip, '研发工具')

    // Category name resolved via the expert taxonomy (name → UUID).
    expect(mockGet).toHaveBeenCalledWith('/admin/plugin_categories', {
      params: { plugin_type: 'expert' },
    })
    const [url, form, config] = mockPost.mock.calls[0]
    expect(url).toBe('/admin/plugins/container_reupload/exp-1')
    expect(form).toBeInstanceOf(FormData)
    expect((form as FormData).get('file')).toBeInstanceOf(File)
    expect(((form as FormData).get('file') as File).name).toBe('expert.zip')
    expect((form as FormData).get('category_id')).toBe('c-dev')
    expect(config).toMatchObject({ signal: undefined })
    // No legacy /admin/experts PATCH and no per-skill presign upload.
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('encodes the id and resolves the squad taxonomy (expert_team)', async () => {
    installGet({ '/admin/plugin_categories': teamCategories })
    mockPost.mockResolvedValue({
      data: { data: { plugin: { plugin_id: 'sq 1' }, relations: [] } },
    })
    const zip = new File([new Uint8Array([1])], 'squad.zip')

    await reuploadSquadContainer('sq 1', zip, '营销策划')

    expect(mockGet).toHaveBeenCalledWith('/admin/plugin_categories', {
      params: { plugin_type: 'expert_team' },
    })
    const [url, form] = mockPost.mock.calls[0]
    expect(url).toBe('/admin/plugins/container_reupload/sq%201')
    expect((form as FormData).get('category_id')).toBe('c-mkt')
  })

  it('omits category_id and skips the taxonomy lookup when no category is given', async () => {
    mockPost.mockResolvedValue({
      data: { data: { plugin: { plugin_id: 'exp-1' }, relations: [] } },
    })
    const zip = new File([new Uint8Array([1])], 'expert.zip')

    await reuploadExpertContainer('exp-1', zip)

    expect(mockGet).not.toHaveBeenCalled()
    const [, form] = mockPost.mock.calls[0]
    expect((form as FormData).get('category_id')).toBeNull()
    expect((form as FormData).get('file')).toBeInstanceOf(File)
  })
})

describe('expert category CRUD — unified /admin/plugin_categories surface', () => {
  it('lists expert categories and maps the unified wire to ExpertCategory', async () => {
    installGet({
      '/admin/plugin_categories': {
        data: [
          {
            category_id: 'c-dev',
            name: '研发工具',
            icon_key: 'wrench',
            plugin_types: ['expert', 'expert_team'],
            sort_order: 2,
            plugin_count: 5,
          },
        ],
      },
    })

    const rows = await listExpertCategories()

    expect(mockGet).toHaveBeenCalledWith('/admin/plugin_categories', {
      params: { plugin_type: 'expert' },
    })
    expect(rows).toEqual([
      {
        expert_category_id: 'c-dev',
        name: '研发工具',
        icon_key: 'wrench',
        sort_order: 2,
        count: 5,
        plugin_types: ['expert', 'expert_team'],
      },
    ])
  })

  it('creates a category with both expert plugin types', async () => {
    mockPost.mockResolvedValue({
      data: { data: { category_id: 'c-new', name: '新分类', sort_order: 3 } },
    })

    const created = await createExpertCategory({ name: '新分类', sort_order: 3 })

    expect(mockPost).toHaveBeenCalledWith('/admin/plugin_categories', {
      name: '新分类',
      icon_key: '',
      plugin_types: ['expert', 'expert_team'],
      sort_order: 3,
    })
    expect(created).toEqual({
      expert_category_id: 'c-new',
      name: '新分类',
      icon_key: undefined,
      sort_order: 3,
      count: undefined,
    })
  })

  it('updates a category, echoing icon_key and both plugin types', async () => {
    mockPatch.mockResolvedValue({
      data: { data: { category_id: 'c-dev', name: '改名', icon_key: 'wrench', sort_order: 1 } },
    })

    const updated = await updateExpertCategory('c-dev', {
      name: '改名',
      icon_key: 'wrench',
      sort_order: 1,
    })

    expect(mockPatch).toHaveBeenCalledWith('/admin/plugin_categories/c-dev', {
      name: '改名',
      icon_key: 'wrench',
      plugin_types: ['expert', 'expert_team'],
      sort_order: 1,
    })
    expect(updated.expert_category_id).toBe('c-dev')
    expect(updated.name).toBe('改名')
  })

  it('echoes the row existing plugin_types on update so a shared category is not narrowed (review P2-2)', async () => {
    mockPatch.mockResolvedValue({
      data: { data: { category_id: 'c-dev', name: '改名', sort_order: 1 } },
    })

    await updateExpertCategory('c-dev', {
      name: '改名',
      icon_key: 'wrench',
      sort_order: 1,
      // A category shared by expert + expert_team + connector: renaming it from
      // this tab must preserve all three, not overwrite with the tab default.
      plugin_types: ['expert', 'expert_team', 'connector'],
    })

    expect(mockPatch).toHaveBeenCalledWith('/admin/plugin_categories/c-dev', {
      name: '改名',
      icon_key: 'wrench',
      plugin_types: ['expert', 'expert_team', 'connector'],
      sort_order: 1,
    })
  })

  it('deletes a category via the unified route', async () => {
    mockDelete.mockResolvedValue({ data: { data: {} } })

    await deleteExpertCategory('c-dev')

    expect(mockDelete).toHaveBeenCalledWith('/admin/plugin_categories/c-dev')
  })
})
