import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { buildConnectCommand, getBotApiUrl } from './connectGuide'

// buildConnectCommand only needs the agent placeholder from i18n.
const t = ((key: string) =>
  key.endsWith('agentPlaceholder') ? 'agent-id' : key) as unknown as TFunction

const base = { displayName: 'My Bot', botId: 'bot-123', token: 'tok-abc' }

describe('buildConnectCommand', () => {
  it('uses the plugin package and api url supplied by the backend', () => {
    const cmd = buildConnectCommand(
      { ...base, connect: { plugin_package: 'create-openclaw-octo', api_url: 'https://api.example.com' } },
      t,
    )
    expect(cmd).toBe(
      'npx -y create-openclaw-octo bind --bot-token tok-abc --api-url https://api.example.com --account-id bot-123 --agent <agent-id>',
    )
  })

  it('adopts a renamed package from the backend without a frontend change', () => {
    const cmd = buildConnectCommand(
      { ...base, connect: { plugin_package: 'openclaw-channel-next', api_url: 'https://api.example.com' } },
      t,
    )
    expect(cmd).toContain('npx -y openclaw-channel-next bind')
  })

  it('falls back to the maintained default package when connect is absent', () => {
    const cmd = buildConnectCommand(base, t)
    expect(cmd).toContain('npx -y create-openclaw-octo bind')
    // Must not emit the deprecated package name.
    expect(cmd).not.toContain('openclaw-channel-dmwork')
  })

  it('falls back to getBotApiUrl when connect omits api_url', () => {
    const cmd = buildConnectCommand(base, t)
    expect(cmd).toContain(`--api-url ${getBotApiUrl()} `)
  })
})
