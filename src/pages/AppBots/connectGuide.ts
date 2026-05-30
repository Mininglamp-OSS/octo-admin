import type { TFunction } from 'i18next'

interface BuildConnectGuideParams {
  displayName: string
  botId: string
  token: string
  apiUrl?: string
}

/** Get API server URL for bot connect guide. */
export function getBotApiUrl(): string {
  return import.meta.env.VITE_BOT_API_URL || window.location.origin
}

export function buildConnectCommand(
  { botId, token, apiUrl = getBotApiUrl() }: BuildConnectGuideParams,
  t: TFunction,
): string {
  const agent = t('appBots:detail.guide.agentPlaceholder')
  return `npx -y openclaw-channel-dmwork bind --bot-token ${token} --api-url ${apiUrl} --account-id ${botId} --agent <${agent}>`
}

export function buildConnectGuide(params: BuildConnectGuideParams, t: TFunction): string {
  return `${t('appBots:detail.guide.body.line1', { name: params.displayName })}
${t('appBots:detail.guide.body.line2')}
${t('appBots:detail.guide.body.line3')}

${buildConnectCommand(params, t)}`
}
