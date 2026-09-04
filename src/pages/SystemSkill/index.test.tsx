import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordRatingOverride, type RatingOverrideLedger } from '../../utils/ratingOverrides'

let tableMounts = 0

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../store/auth', () => ({ useAuthStore: (select: (state: { managerCapabilities: string[] }) => unknown) => select({ managerCapabilities: ['skill.write'] }) }))
vi.mock('../../auth/capabilities', () => ({ hasManagerCapability: () => true }))
vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    Typography: { Title: ({ children }: { children?: React.ReactNode }) => React.createElement('h1', null, children) },
    Tabs: ({ items }: { items: Array<{ key: string; children: React.ReactNode }> }) => React.createElement('div', null, items.map((item) => React.createElement('div', { key: item.key }, item.children))),
  }
})
vi.mock('./CategoryTab', () => ({ default: () => null }))
vi.mock('./SkillTable', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    default: ({ ratingLedger }: { ratingLedger: RatingOverrideLedger }) => {
      React.useEffect(() => { tableMounts += 1 }, [])
      const rating = ratingLedger.overrides.get('skill-1')?.rating ?? null
      return React.createElement('div', null,
        React.createElement('span', { 'data-testid': 'rating' }, String(rating)),
        React.createElement('button', {
          'data-testid': 'inline-five',
          onClick: () => recordRatingOverride(ratingLedger, 'skill-1', 5),
        }, 'inline five'),
      )
    },
  }
})
vi.mock('./DetailDrawer', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    default: ({ onRatingChanged }: { onRatingChanged: (id: string, rating: number) => void }) => React.createElement('button', {
      'data-testid': 'drawer-three',
      onClick: () => onRatingChanged('skill-1', 3),
    }, 'drawer three'),
  }
})
vi.mock('./SkillFormModal', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    default: ({ onSuccess }: { onSuccess: () => void }) => React.createElement('button', {
      'data-testid': 'refresh',
      onClick: onSuccess,
    }, 'refresh'),
  }
})

import SystemSkill from './index'

describe('SystemSkill rating ledger', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    tableMounts = 0
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('keeps the newest inline rating across a refresh after a drawer update', async () => {
    await act(async () => root.render(<SystemSkill />))
    await act(async () => (host.querySelector('[data-testid="drawer-three"]') as HTMLButtonElement).click())
    await act(async () => (host.querySelector('[data-testid="inline-five"]') as HTMLButtonElement).click())
    await act(async () => (host.querySelector('[data-testid="refresh"]') as HTMLButtonElement).click())

    expect(host.querySelector('[data-testid="rating"]')?.textContent).toBe('5')
    expect(tableMounts).toBe(1)
  })
})
