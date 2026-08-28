import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mockPost = vi.hoisted(() => vi.fn())
const mockGet = vi.hoisted(() => vi.fn())
const mockPatch = vi.hoisted(() => vi.fn())
const mockUseAuthStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({ token: 'token-1', logout: vi.fn() })),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      patch: mockPatch,
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}))

vi.mock('../store/auth', () => ({
  useAuthStore: mockUseAuthStore,
}))

vi.mock('../i18n', () => ({
  default: { resolvedLanguage: 'zh-CN' },
  FALLBACK_LANGUAGE: 'zh-CN',
}))

import {
  commitAdminSkillReupload,
  createAdminSkill,
  downloadAdminSkillPackage,
  getAdminSkillMd,
  initReupload,
  uploadIcon,
  getAdminSkill,
  updateAdminSkill,
  updateSkillCategory,
  listSkillCategories,
} from './skill'
import { ApiError } from './index'

// The unified import/reupload response envelope: { data: { plugin, relations } }.
// mapPluginToSkillDetail derives name/version/tags from the plugin wire, and the
// category-name enrichment issues a GET /admin/plugin_categories.
function unifiedSkillPluginResponse() {
  return {
    data: {
      data: {
        plugin: {
          plugin_id: 'skill-1',
          plugin_name: 'Skill One',
          plugin_type: 'skill',
          manifest_json: { name: 'skill-one', description: 'An ops skill.' },
          category_id: 'cat-ops',
          tags: ['tag-1'],
          current_version: '1.0.1',
          visibility: 'system',
          plugin_json: {
            attachments: [
              { path: 'SKILL.md', content_type: 'raw', raw_content: '# doc' },
            ],
          },
        },
        relations: [],
      },
    },
  }
}

// The skill detail wire, carrying a canonical icon (object key), a resolved
// presigned display icon_url, and a backfilled publisher — the three fields the
// icon/publisher round-trip must keep distinct and preserve on edit.
function skillDetailWire() {
  return {
    plugin_id: 'skill-1',
    plugin_name: 'Skill One',
    plugin_type: 'skill',
    manifest_json: { name: 'skill-one', description: 'An ops skill.', labels: ['tag-1'] },
    category_id: 'cat-ops',
    icon: 'icons/skill-1/logo.png',
    icon_url: 'https://presigned.example/skill-1?exp=1h',
    publisher: 'Ops Team',
    tags: ['tag-1'],
    current_version: '1.0.1',
    visibility: 'system',
    plugin_json: {
      attachments: [
        { path: 'SKILL.md', content_type: 'raw', raw_content: '# doc' },
      ],
    },
  }
}

const SKILL_CATEGORIES = {
  data: { data: [{ category_id: 'cat-ops', name: 'Ops' }] },
}

describe('skill icon/publisher round-trip through the translation layer', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPatch.mockReset()
    mockGet.mockImplementation((url: string) =>
      url.includes('plugin_categories')
        ? Promise.resolve(SKILL_CATEGORIES)
        : Promise.resolve({ data: { data: { plugin: skillDetailWire(), relations: [] } } })
    )
    mockPatch.mockResolvedValue({ data: { data: {} } })
  })

  it('maps the canonical icon and the display icon_url onto SEPARATE fields on read', async () => {
    const detail = await getAdminSkill('skill-1')
    expect(detail.icon).toBe('icons/skill-1/logo.png')
    expect(detail.icon_url).toBe('https://presigned.example/skill-1?exp=1h')
  })

  it('preserves the canonical icon and existing publisher on a metadata edit (no icon change)', async () => {
    await updateAdminSkill('skill-1', {
      name: 'skill-one',
      description: 'An ops skill.',
      category_id: 'cat-ops',
      tags: ['tag-1'],
      // icon_url intentionally omitted — operator didn't touch the icon.
    })

    const body = mockPatch.mock.calls[0][1] as {
      plugin: { icon: string; publisher: string }
    }
    // Falls back to the freshly fetched canonical icon, NOT the presigned URL.
    expect(body.plugin.icon).toBe('icons/skill-1/logo.png')
    expect(body.plugin.icon).not.toContain('presigned')
    // Existing publisher echoed so the backend's unconditional stamp can't blank it.
    expect(body.plugin.publisher).toBe('Ops Team')
  })

  it('omits category_id from the PATCH body when the category is explicitly cleared', async () => {
    await updateAdminSkill('skill-1', {
      name: 'skill-one',
      description: 'An ops skill.',
      // An explicit clear (SkillEditModal sends "") must OMIT category_id so the
      // backend NULLs it — a truthy id would set it, a missing key would retain.
      category_id: '',
      tags: ['tag-1'],
    })

    const body = mockPatch.mock.calls[0][1] as { plugin: Record<string, unknown> }
    expect('category_id' in body.plugin).toBe(false)
  })

  it('RETAINS the existing category when category_id is undefined (untouched edit)', async () => {
    // The SkillFormModal edit path maps an untouched category to its real id and
    // an explicit clear to '' (values.category_id ?? ''). This asserts the other
    // half of that contract: an undefined category_id must NOT clear the row — it
    // falls back to the freshly fetched plugin.category_id — which is exactly why
    // the modal must send '' (not undefined) to make a deliberate clear stick.
    await updateAdminSkill('skill-1', {
      name: 'skill-one',
      description: 'An ops skill.',
      category_id: undefined,
      tags: ['tag-1'],
    })

    const body = mockPatch.mock.calls[0][1] as { plugin: { category_id?: string } }
    expect(body.plugin.category_id).toBe('cat-ops')
  })

  it('stamps the canonical manifest + package $schema on the upsert', async () => {
    await updateAdminSkill('skill-1', { name: 'skill-one', tags: [] })

    const body = mockPatch.mock.calls[0][1] as {
      plugin: {
        manifest_json: { $schema: string }
        plugin_json: { $schema: string }
      }
    }
    expect(body.plugin.manifest_json.$schema).toBe('cowork-plugin-manifest-2.0.json')
    expect(body.plugin.plugin_json.$schema).toBe('cowork-plugin-package-2.0.json')
  })

  it('trims + dedupes tags and trims the display name so the backend byte-match holds', async () => {
    await updateAdminSkill('skill-1', {
      display_name: '  Skill One  ',
      name: '  skill-one  ',
      tags: [' tag-1 ', 'tag-1', '', '  '],
    })

    const body = mockPatch.mock.calls[0][1] as {
      plugin: {
        plugin_name: string
        tags: string[]
        manifest_json: { plugin_name: string; name: string; labels: string[] }
      }
    }
    // Trimmed name round-trips to plugin_name and manifest.plugin_name.
    expect(body.plugin.plugin_name).toBe('Skill One')
    expect(body.plugin.manifest_json.plugin_name).toBe('Skill One')
    expect(body.plugin.manifest_json.name).toBe('skill-one')
    // Tags trimmed, empties dropped, deduped — matches manifest.labels.
    expect(body.plugin.tags).toEqual(['tag-1'])
    expect(body.plugin.manifest_json.labels).toEqual(['tag-1'])
  })
})

describe('createAdminSkill', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockGet.mockReset()
    mockPost.mockResolvedValue(unifiedSkillPluginResponse())
    mockGet.mockResolvedValue({
      data: { data: [{ category_id: 'cat-ops', name: 'Ops' }] },
    })
  })

  it('creates a skill through the unified admin plugin import endpoint', async () => {
    const result = await createAdminSkill({
      parse_task_id: 'task-1',
      name: 'skill-one',
      category_id: 'cat-ops',
      tags: ['tag-1'],
      version: '1.0.1',
      description: 'An ops skill.',
    })

    expect(mockPost).toHaveBeenCalledWith('/admin/plugins/skill_import', {
      parse_task_id: 'task-1',
      name: 'skill-one',
      category_id: 'cat-ops',
      tags: ['tag-1'],
      version: '1.0.1',
      description: 'An ops skill.',
    })
    expect(result.skill_id).toBe('skill-1')
    expect(result.version).toBe('1.0.1')
    expect(result.category_name).toBe('Ops')
    // The system wire visibility is preserved (not collapsed to a legacy value).
    expect(result.visibility).toBe('system')
    expect(result.scope).toBe('system')
  })

  it('threads changelog (accepted by skill_import) but not display_name/icon (rejected)', async () => {
    await createAdminSkill({
      parse_task_id: 'task-1',
      name: 'skill-one',
      display_name: 'Skill One',
      category_id: 'cat-ops',
      tags: ['tag-1'],
      version: '1.0.1',
      description: 'An ops skill.',
      changelog: 'initial release',
      icon_url: 'icons/skill-1/logo.png',
    })

    const body = mockPost.mock.calls[0][1] as Record<string, unknown>
    // changelog rides through (the initial version's changelog isn't discarded).
    expect(body.changelog).toBe('initial release')
    // display_name / icon are NOT sent — skill_import decodes with
    // DisallowUnknownFields and rejects them, so they'd 400 the create.
    expect('display_name' in body).toBe(false)
    expect('icon' in body).toBe(false)
    expect('icon_url' in body).toBe(false)
  })
})

describe('commitAdminSkillReupload', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockGet.mockReset()
    mockPost.mockResolvedValue(unifiedSkillPluginResponse())
    mockGet.mockResolvedValue({ data: { data: [] } })
  })

  it('commits an already parsed reupload task through the unified reupload endpoint', async () => {
    const result = await commitAdminSkillReupload('skill-1', {
      parse_task_id: 'task-1',
      version: '1.0.1',
      changelog: 'replace package',
      tags: ['tag-1'],
    })

    expect(mockPost).toHaveBeenCalledWith('/admin/plugins/skill_reupload/skill-1', {
      parse_task_id: 'task-1',
      version: '1.0.1',
      changelog: 'replace package',
      tags: ['tag-1'],
    })
    expect(result.skill_id).toBe('skill-1')
    expect(result.version).toBe('1.0.1')
  })
})

describe('initReupload', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPost.mockResolvedValue({
      data: {
        data: {
          skill_upload_id: 'upload-1',
          presigned_url: 'https://storage.example/upload-1',
          method: 'PUT',
          headers: { 'content-type': 'application/zip' },
        },
      },
    })
  })

  it('uses the admin upload init endpoint that marketplace exposes', async () => {
    const result = await initReupload('skill-1', 'skill.zip', 1024)

    expect(mockPost).toHaveBeenCalledWith('/admin/skill_uploads', {
      file_name: 'skill.zip',
      file_size: 1024,
    })
    expect(result).toEqual({
      upload_id: 'upload-1',
      presigned_url: 'https://storage.example/upload-1',
      method: 'PUT',
      headers: { 'content-type': 'application/zip' },
    })
  })
})

describe('uploadIcon', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPost.mockResolvedValue({
      data: {
        data: {
          object_key: 'icons/icon-1/logo.png',
          presigned_url: 'https://storage.example/icon-1',
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
        },
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
  })

  it('initializes icon upload through marketplace and PUTs to the presigned URL', async () => {
    const file = new File(['png'], 'logo.png', { type: 'image/png' })

    const result = await uploadIcon(file)

    expect(mockPost).toHaveBeenCalledWith('/admin/skill_icon_uploads', {
      file_name: 'logo.png',
      file_size: file.size,
    })
    expect(fetch).toHaveBeenCalledWith('https://storage.example/icon-1', {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: file,
      // putPresignedFile now bounds every PUT with a timeout signal.
      signal: expect.any(AbortSignal),
    })
    expect(result).toEqual({ object_key: 'icons/icon-1/logo.png' })
  })

  it('rejects malformed icon upload init responses before PUT', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { object_key: 'icons/icon-1/logo.png' } } })
    const file = new File(['png'], 'logo.png', { type: 'image/png' })

    await expect(uploadIcon(file)).rejects.toMatchObject({
      code: 'invalid_response',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects unsafe presigned icon upload URL schemes before PUT', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        data: {
          object_key: 'icons/icon-1/logo.png',
          presigned_url: 'javascript:alert(1)',
          method: 'PUT',
          headers: {},
        },
      },
    })
    const file = new File(['png'], 'logo.png', { type: 'image/png' })

    await expect(uploadIcon(file)).rejects.toMatchObject({
      code: 'invalid_response',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('downloadAdminSkillPackage', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      data: new Blob(['zip-bytes'], { type: 'application/zip' }),
      headers: { 'content-disposition': 'attachment; filename="pkg.zip"' },
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    // jsdom would attempt a real navigation on anchor.click(); stub it out so the
    // save-trigger is exercised without the "navigation not implemented" noise.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('streams from the ADMIN download endpoint as a blob (admin client, no X-Space-Id)', async () => {
    await downloadAdminSkillPackage('skill-1', 'my-skill.zip')

    expect(mockGet).toHaveBeenCalledWith('/admin/plugins/skill-1/download', {
      responseType: 'blob',
    })
    // Never the tenant route that needs X-Space-Id and applies tenant scope.
    const url = mockGet.mock.calls[0][0] as string
    expect(url).not.toContain('/plugins/download')
    expect(url).not.toMatch(/\/admin\/skills\//)
    // No X-Space-Id / params leaking a tenant scope onto the admin call.
    const opts = mockGet.mock.calls[0][1] as { params?: unknown }
    expect(opts.params).toBeUndefined()
  })
})

describe('getAdminSkillMd', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('fetches raw SKILL.md from the ADMIN skill_md endpoint', async () => {
    mockGet.mockResolvedValue({ data: { data: { content: '# SKILL.md raw' } } })

    const content = await getAdminSkillMd('skill-1')

    expect(mockGet).toHaveBeenCalledWith('/admin/plugins/skill-1/skill_md')
    // Not the legacy /admin/skills/{id}/skill_md route.
    expect(mockGet.mock.calls[0][0]).not.toMatch(/\/admin\/skills\//)
    expect(content).toBe('# SKILL.md raw')
  })

  it('returns null when the admin skill_md endpoint 404s (older skills)', async () => {
    mockGet.mockRejectedValue(new ApiError('not found', 404))

    await expect(getAdminSkillMd('skill-1')).resolves.toBeNull()
  })

  it('rethrows non-404 errors', async () => {
    mockGet.mockRejectedValue(new ApiError('boom', 500))

    await expect(getAdminSkillMd('skill-1')).rejects.toMatchObject({ status: 500 })
  })
})

describe('updateSkillCategory — echoes sort_order + icon_key on the full-replace PATCH', () => {
  beforeEach(() => {
    mockPatch.mockReset()
    mockPatch.mockResolvedValue({
      data: { data: { category_id: 'cat-1', name: '改名', icon_key: 'wrench', sort_order: 7 } },
    })
  })

  it('sends the existing sort_order so a rename does not zero it (review P1)', async () => {
    await updateSkillCategory('cat-1', {
      name: '改名',
      icon_key: 'wrench',
      sort_order: 7,
    })

    expect(mockPatch).toHaveBeenCalledWith('/admin/plugin_categories/cat-1', {
      name: '改名',
      icon_key: 'wrench',
      plugin_types: ['skill'],
      sort_order: 7,
    })
  })

  it('defaults sort_order to 0 (not undefined) when omitted, mirroring the twins', async () => {
    await updateSkillCategory('cat-1', { name: '改名', icon_key: 'wrench' })

    const body = mockPatch.mock.calls[0][1] as { sort_order: number }
    expect(body.sort_order).toBe(0)
  })

  it('echoes the row EXISTING plugin_types so a shared category is not narrowed to ["skill"] (review P1-C)', async () => {
    // A category shared by skill + connector: renaming/reordering it from the
    // skill tab must keep BOTH types, not overwrite with ['skill'].
    await updateSkillCategory('cat-1', {
      name: '改名',
      icon_key: 'wrench',
      sort_order: 7,
      plugin_types: ['skill', 'connector'],
    })

    const body = mockPatch.mock.calls[0][1] as { plugin_types: string[] }
    expect(body.plugin_types).toEqual(['skill', 'connector'])
  })

  it('falls back to the skill-only plugin_types when the caller omits them', async () => {
    await updateSkillCategory('cat-1', { name: '改名', sort_order: 7 })

    const body = mockPatch.mock.calls[0][1] as { plugin_types: string[] }
    expect(body.plugin_types).toEqual(['skill'])
  })

  it('carries plugin_types onto the mapped list row so the tab can echo them back', async () => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            category_id: 'cat-1',
            name: '通用',
            icon_key: 'wrench',
            sort_order: 3,
            plugin_count: 4,
            plugin_types: ['skill', 'connector'],
          },
        ],
      },
    })

    const rows = await listSkillCategories()
    expect(rows[0].plugin_types).toEqual(['skill', 'connector'])
  })
})
