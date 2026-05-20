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

export function buildConnectCommand({
  botId,
  token,
  apiUrl = getBotApiUrl(),
}: BuildConnectGuideParams): string {
  return `npx -y openclaw-channel-dmwork bind --bot-token ${token} --api-url ${apiUrl} --account-id ${botId} --agent <agent标识>`
}

export function buildConnectGuide(params: BuildConnectGuideParams): string {
  return `将 Octo bot ${params.displayName} 绑定到 Agent。
默认绑定到当前 Session 的 Agent，agent 标识通过 /status 查看。
如果用户指定了其他 Agent，使用用户指定的标识替换。

${buildConnectCommand(params)}`
}
