import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPost = vi.hoisted(() => vi.fn())
const mockGet = vi.hoisted(() => vi.fn())
const mockUseAuthStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({ token: 'token-1', logout: vi.fn() })),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      patch: vi.fn(),
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
