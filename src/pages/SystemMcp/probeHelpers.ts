/**
 * Pure helpers extracted from `FormModal.tsx#handleProbe` so the two most
 * fragile branches of the probe flow can be unit-tested without spinning up
 * the whole 3-step wizard.
 *
 *   1. buildProbeRequest — assembles the wire payload from the form's
 *      remote-connection fields. Headers come in as a plain map already
 *      resolved from the KvEditor rows.
 *   2. resolveProbeErrorMessage — turns a backend probe envelope with
 *      ok=false into the final `message.error` string, going through the
 *      error-code i18n table first and only falling back to the raw wire
 *      message / generic "probeFailed" when the code is unknown.
 *
 * Keeping these outside the component means the handler in the wizard reads
 * as orchestration only (validate → build → call → dispatch outcome), and
 * the branchy bits live somewhere a vitest can reach them directly.
 */

import type {
  McpProbeRequest,
  McpProbeResponse,
  McpTransport,
} from '../../api/mcp'

/** i18n `t()` shape the helpers need — subset of react-i18next's TFunction
 *  so callers can pass in either the real hook result or a stub in tests. */
export type TFn = (
  key: string,
  opts?: { defaultValue?: string; count?: number },
) => string

/** Fields lifted out of FormValues that the probe request actually cares
 *  about. Kept as a flat object (not the full FormValues) so callers don't
 *  have to construct a fake form state just to test payload assembly. */
export interface ProbeFormFields {
  transport: McpTransport
  url: string
  /** Header map already resolved from the KvEditor rows in the caller.
   *  Rows whose toggle is ON in the wizard carry whatever value the
   *  operator typed (probe is off-record, so real credentials go on the
   *  wire even for user-supplied slots — otherwise the handshake fails
   *  auth). */
  headers: Record<string, string>
}

/** Build the POST /admin/mcps/probe body from the current form fields. Only
 *  streamable-http / sse transports produce a payload — stdio is not
 *  probable from the server (mcp-v1.md §4.7). Returns null for non-remote
 *  transports so the caller can noop instead of firing a doomed request.
 *
 *  The backend struct is `service.ProbeRequest` (probe.go:57), which only
 *  declares transport, url, command, args, env, headers — and the handler
 *  decodes with DisallowUnknownFields, so any extra field is rejected as
 *  "request body is not valid JSON". `env_user_supplied` /
 *  `headers_user_supplied` are intentionally NOT sent; probe is off-record
 *  and needs real values in place. */
export function buildProbeRequest(
  fields: ProbeFormFields,
): McpProbeRequest | null {
  const remote =
    fields.transport === 'streamable-http' || fields.transport === 'sse'
  if (!remote) return null
  const trimmedURL = fields.url.trim()
  if (!trimmedURL) return null
  const headers = Object.keys(fields.headers).length ? fields.headers : undefined
  return {
    transport: fields.transport,
    url: trimmedURL,
    headers,
  }
}

/** Translate a failed probe envelope into the string shown via `message.error`.
 *  The resolution order matches web (dmworkmcp/McpCreateModal.handleProbe):
 *    1. If the wire returned a code AND `form.probeError.<code>` resolves
 *       to a real i18n string, use it.
 *    2. Otherwise fall back to the wire message.
 *    3. If neither is available, use the generic `form.probeFailed`.
 *  The `code` step uses defaultValue so an unknown code silently falls
 *  through instead of surfacing a raw key like "form.probeError.foo". */
export function resolveProbeErrorMessage(
  resp: McpProbeResponse,
  t: TFn,
): string {
  const wireMessage = resp.error?.message || ''
  const genericFallback = t('form.probeFailed')
  const code = resp.error?.code
  if (code) {
    const translated = t(`form.probeError.${code}`, {
      defaultValue: wireMessage || genericFallback,
    })
    return translated
  }
  return wireMessage || genericFallback
}
