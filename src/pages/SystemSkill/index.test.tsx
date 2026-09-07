import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rating: null as number | null,
  listSkills: vi.fn(),
  listCategories: vi.fn(),
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) }
})
vi.mock('../../store/auth', () => ({
  useAuthStore: (select: (state: { managerCapabilities: string[] }) => unknown) =>
    select({ managerCapabilities: ['skill.write'] }),
}))
vi.mock('../../auth/capabilities', () => ({ hasManagerCapability: () => true }))
vi.mock('../../hooks/useSpaceNameMap', () => ({ useSpaceNameMap: () => ({ nameOf: () => '' }) }))
vi.mock('../../api/skill', async () => {
  const actual = await vi.importActual<typeof import('../../api/skill')>('../../api/skill')
  return {
    ...actual,
    listCategories: mocks.listCategories,
    listSkills: mocks.listSkills,
  }
})
vi.mock('./CategoryTab', () => ({ default: () => null }))
vi.mock('./DetailDrawer', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    default: ({ onRatingChanged }: { onRatingChanged: (id: string, rating: number) => void }) =>
      React.createElement('button', {
        'data-testid': 'drawer-three',
        onClick: () => {
          mocks.rating = 3
          onRatingChanged('skill-1', 3)
        },
      }, 'drawer three'),
  }
})
vi.mock('./SkillFormModal', () => ({ default: () => null }))

import SystemSkill from './index'

describe('SystemSkill rating reconciliation', () => {
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
    mocks.rating = null
    mocks.listCategories.mockReset().mockResolvedValue([])
    mocks.listSkills.mockReset().mockImplementation(async () => ({
      items: [{
        id: 'skill-1',
        name: 'skill-one',
        display_name: 'Skill One',
        description: '',
        version: '1.0.0',
        category_id: '',
        category_name: '',
        tags: [],
        owner_name: 'Owner',
        visibility: 'system',
        rating: mocks.rating,
        view_count: 0,
        install_count: 0,
        download_count: 0,
        created_at: '',
        updated_at: '',
      }],
      next_cursor: undefined,
    }))
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('updates the real table row after a drawer rating without remounting the table', async () => {
    await act(async () => root.render(<SystemSkill />))
    await act(async () => {})

    expect(host.textContent).toContain('pluginRating.unrated')
    expect(mocks.listCategories).toHaveBeenCalledTimes(1)
    expect(mocks.listSkills).toHaveBeenCalledTimes(1)

    await act(async () => {
      ;(host.querySelector('[data-testid="drawer-three"]') as HTMLButtonElement).click()
    })
    await act(async () => {})

    expect(mocks.listSkills).toHaveBeenCalledTimes(2)
    expect(mocks.listCategories).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('pluginRating.unrated')
    expect(host.querySelectorAll('.ant-rate-star-full')).toHaveLength(3)
  })
})
