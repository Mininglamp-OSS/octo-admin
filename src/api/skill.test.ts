import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  initReupload,
  uploadIcon,
  getAdminSkill,
  updateAdminSkill,
} from './skill'

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

    expect(mockPost).toHaveBeenCalledWith('/skill_icon_uploads', {
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
