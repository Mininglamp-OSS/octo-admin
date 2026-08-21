import { describe, expect, it } from 'vitest'
import enUS from '../../i18n/locales/en-US/spaceAdmin.json'
import zhCN from '../../i18n/locales/zh-CN/spaceAdmin.json'
import navEN from '../../i18n/locales/en-US/nav.json'
import navZH from '../../i18n/locales/zh-CN/nav.json'
import appBotsEN from '../../i18n/locales/en-US/appBots.json'
import appBotsZH from '../../i18n/locales/zh-CN/appBots.json'
// 用 Vite 的 ?raw 读源码（不引 node API，`tsc` 在 build 时也编译测试文件，
// 而本仓库没有 @types/node）。断言的是「这段行为写在了源码里」，不是实现细节的复刻。
import entrySource from './SpaceEntry.tsx?raw'
import listSource from '../AppBots/index.tsx?raw'

describe('space console sign-in', () => {
  // The space console used to have no sign-in of its own: it could only borrow an IM
  // session token that happened to sit in the same tab's sessionStorage. Open it in a
  // fresh tab and it was a dead end; arrive as a super admin and it silently bounced
  // you back to the super dashboard. Both paths now land on a real sign-in form.
  it('signs in through the user login endpoint rather than borrowing a session token', () => {
    expect(entrySource).toContain("import { userLogin } from '../../api/auth'")
    expect(entrySource).toContain('async function handleLogin')
    expect(entrySource).toContain('await userLogin(values)')
  })

  it('offers the form when the tab carries no session token', () => {
    expect(entrySource).toMatch(/const token = readSessionToken\(\)\s*\n\s*if \(!token\) \{[\s\S]*?setStatus\('form'\)/)
    expect(entrySource).not.toContain("setStatus('no-token')")
  })

  it('lets a super admin switch identity instead of bouncing them away', () => {
    expect(entrySource).toMatch(/scope === 'super'[\s\S]*?setCameFromSuper\(true\)[\s\S]*?setStatus\('form'\)/)
    expect(entrySource).not.toMatch(/scope === 'super'[\s\S]{0,120}navigate\('\/dashboard'/)
    expect(entrySource).toContain("t('entry.login.superNotice')")
  })

  it('keeps sign-in copy in both locales', () => {
    const keys = [
      'entry.login.title',
      'entry.login.subtitle',
      'entry.login.superNotice',
      'entry.login.username',
      'entry.login.password',
      'entry.login.usernameRequired',
      'entry.login.passwordRequired',
      'entry.login.submit',
      'entry.login.toSuper',
      'entry.login.noToken',
    ] as const
    for (const key of keys) {
      expect(zhCN[key], `zh-CN ${key}`).toBeTruthy()
      expect(enUS[key], `en-US ${key}`).toBeTruthy()
    }
    // The replaced dead-end copy must not linger in either locale.
    for (const stale of ['entry.noToken.title', 'entry.noToken.subtitle', 'entry.noToken.action']) {
      expect(Object.keys(zhCN)).not.toContain(stale)
      expect(Object.keys(enUS)).not.toContain(stale)
    }
  })
})

describe('reaching space-level app bots from the super admin console', () => {
  it('names the space console in the sidebar', () => {
    expect(navZH.spaceConsole).toBeTruthy()
    expect(navEN.spaceConsole).toBeTruthy()
  })

  it('explains that the platform list omits space-level bots', () => {
    for (const bundle of [appBotsZH, appBotsEN]) {
      expect(bundle['list.platformOnly.title']).toBeTruthy()
      expect(bundle['list.platformOnly.desc']).toBeTruthy()
      expect(bundle['list.platformOnly.link']).toBeTruthy()
    }
    // The notice belongs on the platform list only; inside a space console it would be wrong.
    expect(listSource).toMatch(/\{!spaceId && \([\s\S]*?list\.platformOnly\.title/)
    expect(listSource).toContain('href="/admin/space"')
  })
})
