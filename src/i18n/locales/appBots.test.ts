import { describe, expect, it } from 'vitest'
import enUS from './en-US/appBots.json'
import zhCN from './zh-CN/appBots.json'

describe('app bot connect guide copy', () => {
  it('keeps Agent terminology for the OpenClaw bind target', () => {
    expect(enUS['detail.guide.intro']).toContain('Agent')
    expect(enUS['detail.guide.footer']).toContain('different Agent')
    expect(enUS['detail.guide.body.line1']).toContain('Agent')
    expect(enUS['detail.guide.body.line2']).toContain("Session's Agent")
    expect(enUS['detail.guide.body.line3']).toContain('different Agent')
    expect(enUS['detail.guide.agentPlaceholder']).toBe('agent-id')
    expect(enUS['create.guide.intro']).toContain('Agent')
    expect(enUS['create.guide.footer']).toContain('different Agent')

    expect(zhCN['detail.guide.intro']).toContain('Agent')
    expect(zhCN['detail.guide.footer']).toContain('其他 Agent')
    expect(zhCN['detail.guide.body.line1']).toContain('Agent')
    expect(zhCN['detail.guide.body.line2']).toContain('Session 的 Agent')
    expect(zhCN['detail.guide.body.line3']).toContain('其他 Agent')
    expect(zhCN['detail.guide.agentPlaceholder']).toBe('agent标识')
    expect(zhCN['create.guide.intro']).toContain('Agent')
    expect(zhCN['create.guide.footer']).toContain('其他 Agent')
  })
})
