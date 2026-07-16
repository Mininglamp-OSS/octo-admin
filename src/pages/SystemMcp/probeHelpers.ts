/**
 * Pure helpers extracted from `FormModal.tsx#handleProbe` so the two most
 * fragile branches of the probe flow can be unit-tested without spinning up
 * the whole 3-step wizard.
 *
 *   1. buildProbeRequest — assembles the wire payload from the form's
 *      remote-connection fields, including the optional headers block which
 *      is a `key: value\n...` textarea in the UI.
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
  McpAuthType,
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
  authType: McpAuthType
  /** Raw `Header-Name: value\n...` textarea contents. Parsed here so the
   *  helper owns the split-and-trim rules (same as FormModal's parseKV). */
  headersRaw: string
  /** Optional ephemeral bearer token supplied via the "试连密钥（不保存）"
   *  field. When authType=bearer AND this is non-empty, it overrides any
   *  Authorization value coming from `headersRaw` and is written as
   *  `Authorization: Bearer <token>` on the probe wire. Never persisted —
   *  the caller MUST NOT include this in the create/update payload. */
  probeBearer?: string
}

/** Parse a `key: value\n...` block into a plain object. Duplicated from
 *  FormModal.parseKV so this file has no cross-module dependency; the two
 *  copies must stay in sync (the FormModal one also handles `=` for env). */
function parseHeaderBlock(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const k = trimmed.slice(0, idx).trim()
    const v = trimmed.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

/** Build the POST /admin/mcps/probe body from the current form fields. Only
 *  streamable-http / sse transports produce a payload — stdio is not
 *  probable from the server (mcp-v1.md §4.7). Returns null for non-remote
 *  transports so the caller can noop instead of firing a doomed request.
 *
 *  IMPORTANT: `authType` is intentionally not sent. The backend struct is
 *  `service.ProbeRequest` (probe.go:57), which only declares transport, url,
 *  command, args, env, headers — and the handler decodes with
 *  DisallowUnknownFields, so any extra field is rejected as
 *  "request body is not valid JSON". The Bearer token, when set, already
 *  reaches the remote MCP via `Authorization` in the headers map, so
 *  dropping authType from the wire has no functional cost. web's
 *  dmworkmcp/McpCreateModal.handleProbe follows the same rule. */
export function buildProbeRequest(
  fields: ProbeFormFields,
): McpProbeRequest | null {
  const remote =
    fields.transport === 'streamable-http' || fields.transport === 'sse'
  if (!remote) return null
  const trimmedURL = fields.url.trim()
  if (!trimmedURL) return null
  const parsed = fields.headersRaw
    ? parseHeaderBlock(fields.headersRaw)
    : {}
  const ephemeral = (fields.probeBearer ?? '').trim()
  if (fields.authType === 'bearer' && ephemeral) {
    // The ephemeral bearer wins over any Authorization coming from the
    // persisted headers map (typically the SECRET_PLACEHOLDER sentinel) —
    // the user's just-typed token is the more explicit signal.
    parsed.Authorization = `Bearer ${ephemeral}`
  }
  const headers = Object.keys(parsed).length ? parsed : undefined
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
