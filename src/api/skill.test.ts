import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPost = vi.hoisted(() => vi.fn())
const mockUseAuthStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({ token: 'token-1', logout: vi.fn() })),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
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
  initReupload,
  uploadIcon,
} from './skill'

describe('commitAdminSkillReupload', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPost.mockResolvedValue({
      data: {
        data: {
          skill_id: 'skill-1',
          name: 'skill-one',
          display_name: 'Skill One',
          tags: ['tag-1'],
          version: '1.0.1',
        },
      },
    })
  })

  it('commits an already parsed reupload task through the reupload endpoint', async () => {
    const result = await commitAdminSkillReupload('skill-1', {
      parse_task_id: 'task-1',
      version: '1.0.1',
      changelog: 'replace package',
      tags: ['tag-1'],
    })

    expect(mockPost).toHaveBeenCalledWith('/admin/skills/skill-1/reupload', {
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
