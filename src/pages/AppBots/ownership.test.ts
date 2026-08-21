import { describe, expect, it } from 'vitest'
import enUS from '../../i18n/locales/en-US/appBots.json'
import zhCN from '../../i18n/locales/zh-CN/appBots.json'
import listSource from './index.tsx?raw'
import apiSource from '../../api/app-bot.ts?raw'

// A bot that moves to space scope used to drop out of the platform list with nothing to
// explain it. The list now carries an ownership dimension: a filter to choose what you
// are looking at, and a column that says which space owns each row.
describe('app bot ownership', () => {
  it('asks the server for a scope and defaults to the historical platform-only view', () => {
    expect(apiSource).toContain("export type AppBotScopeFilter = 'platform' | 'space' | 'all'")
    expect(apiSource).toContain('scope?: AppBotScopeFilter')
    expect(listSource).toContain("useState<AppBotScopeFilter>('platform')")
    expect(listSource).toContain('scope: scopeFilter')
  })

  it('refetches when the ownership filter changes', () => {
    expect(listSource).toMatch(/\}, \[page, debouncedKeyword, statusFilter, scopeFilter, spaceId\]\)/)
  })

  it('shows ownership as a column, and only on the platform console', () => {
    // Inside a space console every row belongs to that space, so the column would be noise.
    expect(listSource).toMatch(/\.\.\.\(spaceId\s*\?\s*\[\]\s*:\s*\[[\s\S]*?column\.ownership/)
    expect(listSource).toContain('record.space_name || record.space_id')
  })

  it('stops claiming the list is platform-only once the filter widens', () => {
    expect(listSource).toContain("{!spaceId && scopeFilter === 'platform' && (")
  })

  it('names both owners in both locales, without reusing the templated detail label', () => {
    for (const bundle of [zhCN, enUS]) {
      expect(bundle['column.ownership']).toBeTruthy()
      expect(bundle['list.scopeFilter.platform']).toBeTruthy()
      expect(bundle['list.scopeFilter.space']).toBeTruthy()
      expect(bundle['list.scopeFilter.all']).toBeTruthy()
      expect(bundle['scope.platform']).toBeTruthy()
      expect(bundle['scope.space']).toBeTruthy()
      // detail.scope.space interpolates a space id; it is a sentence, not a tag label.
      expect(bundle['scope.space']).not.toContain('{{')
    }
  })
})
