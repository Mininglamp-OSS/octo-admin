import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createPluginScene: vi.fn(),
  deletePluginScene: vi.fn(),
  listPluginScenes: vi.fn(),
  updatePluginScene: vi.fn(),
}))
const translate = vi.hoisted(() => (key: string) => key)

vi.mock('../../api/marketplace-scene', () => api)
vi.mock('../../store/auth', () => ({
  useAuthStore: (select: (state: { managerCapabilities: string[] }) => unknown) =>
    select({ managerCapabilities: ['skill.write'] }),
}))
vi.mock('../../auth/capabilities', () => ({ hasManagerCapability: () => true }))
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return { ...actual, useTranslation: () => ({ t: translate }) }
})
vi.mock('@ant-design/icons', () => ({ PlusOutlined: () => null }))

import SceneTab from './SceneTab'

const scenes = [
  {
    scene_id: 'scene-default',
    scene_code: 'default',
    name: 'Default',
    description: '',
    sort_order: 0,
    plugin_count: 1,
    category_count: 0,
    created_at: '',
    updated_at: '',
  },
  {
    scene_id: 'scene-featured',
    scene_code: 'featured',
    name: 'Featured',
    description: 'Featured plugins',
    sort_order: 10,
    plugin_count: 2,
    category_count: 1,
    created_at: '',
    updated_at: '',
  },
]

describe('SceneTab', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    Object.values(api).forEach((mock) => mock.mockReset())
    api.listPluginScenes.mockResolvedValue(scenes)
    api.updatePluginScene.mockResolvedValue(scenes[0])
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('keeps scene_code immutable on edit, protects default deletion, and validates create codes', async () => {
    await act(async () => root.render(<SceneTab />))
    await vi.waitFor(() => expect(api.listPluginScenes).toHaveBeenCalledOnce())

    const deleteButtons = Array.from(host.querySelectorAll('button'))
      .filter((button) => button.textContent === 'scene.delete')
    expect(deleteButtons).toHaveLength(2)
    expect(deleteButtons[0].disabled).toBe(true)
    expect(deleteButtons[1].disabled).toBe(false)

    const editButton = Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent === 'scene.edit') as HTMLButtonElement
    await act(async () => editButton.click())
    const editInputs = Array.from(document.querySelectorAll('.ant-modal input')) as HTMLInputElement[]
    expect(editInputs[0].disabled).toBe(true)

    await act(async () => {
      ;(document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLButtonElement).click()
    })
    await vi.waitFor(() => expect(api.updatePluginScene).toHaveBeenCalledOnce())
    expect(api.updatePluginScene.mock.calls[0][1]).not.toHaveProperty('scene_code')

    const createButton = Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent === 'scene.create') as HTMLButtonElement
    await act(async () => createButton.click())
    const codeInput = document.querySelector('.ant-modal input') as HTMLInputElement
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      valueSetter?.call(codeInput, 'INVALID')
      codeInput.dispatchEvent(new Event('input', { bubbles: true }))
      codeInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      ;(document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLButtonElement).click()
    })
    await vi.waitFor(() => expect(document.body.textContent).toContain('scene.field.codeInvalid'))
    expect(api.createPluginScene).not.toHaveBeenCalled()
  })
})
