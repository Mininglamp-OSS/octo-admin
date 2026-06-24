import type { TFunction } from 'i18next'
import type { BotConnectInfo } from '../../api/app-bot'

/**
 * Fallback npm package an Agent runs (`npx -y <pkg> bind ...`) when the backend
 * does not supply `connect.plugin_package`. Kept in sync with octo-server's
 * `botutil.DefaultPluginPackage`; the backend is the source of truth, this only
 * covers older servers that predate the `connect` field.
 */
const DEFAULT_PLUGIN_PACKAGE = 'create-openclaw-octo'

interface BuildConnectGuideParams {
  displayName: string
  botId: string
  token: string
  /** Backend-owned connect facts; falls back to defaults when absent. */
  connect?: BotConnectInfo
}

/** Fallback API server URL for the bot connect guide when the backend omits it. */
export function getBotApiUrl(): string {
  return import.meta.env.VITE_BOT_API_URL || window.location.origin
}

export function buildConnectCommand(
  { botId, token, connect }: BuildConnectGuideParams,
  t: TFunction,
): string {
  const agent = t('appBots:detail.guide.agentPlaceholder')
  const pluginPackage = connect?.plugin_package || DEFAULT_PLUGIN_PACKAGE
  const apiUrl = connect?.api_url || getBotApiUrl()
  return `npx -y ${pluginPackage} bind --bot-token ${token} --api-url ${apiUrl} --account-id ${botId} --agent <${agent}>`
}

export function buildConnectGuide(params: BuildConnectGuideParams, t: TFunction): string {
  return `${t('appBots:detail.guide.body.line1', { name: params.displayName })}
${t('appBots:detail.guide.body.line2')}
${t('appBots:detail.guide.body.line3')}

${buildConnectCommand(params, t)}`
}
