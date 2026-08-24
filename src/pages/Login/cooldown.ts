/**
 * The server is authoritative for resend throttling. The UI keeps a
 * two-minute minimum so the button does not invite a second request sooner
 * than the product-facing cooldown, while still honoring a longer server
 * cooldown.
 *
 * A zero cooldown is meaningful only before the first code is sent: it lets
 * the user explicitly request the first code immediately. Once a code has
 * been sent, an absent or invalid server value falls back to the UI minimum.
 */
export const minimumResendCooldownSeconds = 2 * 60

export function getResendCooldownSeconds(
  resendAfter: number | undefined,
  codeSent: boolean,
): number {
  const serverSeconds = Number(resendAfter)
  if (!Number.isFinite(serverSeconds) || serverSeconds <= 0) {
    return codeSent ? minimumResendCooldownSeconds : 0
  }
  return Math.max(minimumResendCooldownSeconds, Math.ceil(serverSeconds))
}
