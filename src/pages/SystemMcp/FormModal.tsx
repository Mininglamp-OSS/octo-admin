/**
 * System MCP create / edit — 3-step wizard aligned with octo-web's
 * `dmworkmcp/McpCreateModal`. Structural parity is intentional: step order,
 * field grouping, `+ 新增一条` dynamic lists, slug auto-derive-from-name,
 * `试连 / 获取工具列表` probe, and reset-on-close all match the user-facing
 * modal. antd primitives replace Semi UI, but the visible flow is identical
 * so the two consoles feel like one product.
 *
 * Differences kept on purpose:
 *   - No visibility control on step 3 — system MCPs are stamped
 *     `visibility=system` by the admin endpoint (marketplace v1 §4.10),
 *     so surfacing 公开/仅自己 here would mislead.
 *   - Icon input is still emoji-or-URL text; the file upload flow used by
 *     octo-web rides on the main IM `file/upload/credentials` service that
 *     admin isn't wired into. Emoji covers 90% of the seeded set; the 72×72
 *     preview tile mirrors web's visual language even without an uploader.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Steps,
  Switch,
  Rate,
  message,
} from 'antd'
import {
  CloseOutlined,
  DeleteOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  createSystemMcp,
  listMcpCategories,
  probeSystemMcp,
  updateSystemMcp,
  uploadMcpIcon,
  type CreateMcpParams,
  type McpCategory,
  type McpDetail,
  type McpFaq,
  type McpServerEntryWire,
  type McpTool,
  type McpTransport,
  type PluginAttachmentWire,
} from '../../api/mcp'
import { updatePluginRating } from '../../api/plugin'
import {
  buildProbeRequest,
  resolveProbeErrorMessage,
} from './probeHelpers'

const TRANSPORT_OPTIONS: McpTransport[] = ['streamable-http', 'sse', 'stdio']

// Marketplace-shared sentinel (octo-marketplace/docs/api/mcp-v1.md §0 /
// §5.1). When bearer auth is declared but the operator hasn't pasted a
// real token in the Headers block, we persist this placeholder so the
// wire contract holds: "bearer auth → Authorization present, empty or
// sentinel means the downstream user should substitute their own token".
// The ephemeral probe field is deliberately separate and never seeded here.
// Marketplace-shared sentinel (octo-marketplace/docs/api/mcp-v1.md §0 /
// §5.1). Since the §5.1 relaxation, user-supplied values are stored and
// returned VERBATIM on every read — the unified backend has NO secret scanner
// and does NOT blank values to non-owners. The only protection is client-side:
// user-supplied keys render as a fill-in placeholder in the market snippet, so
// owners must not type real secrets under a shared key. The constant is kept
// because `entriesFromWire` still normalizes a legacy sentinel literal back to
// "" when reading an old record.
const SECRET_PLACEHOLDER_SENTINEL = '__OCTO_SECRET_PLACEHOLDER__'

/** One row in the structured Headers / Env editor. Each row carries a
 *  per-key toggle for the wire's `headers_user_supplied` /
 *  `env_user_supplied` arrays (mcp-v1.md §5.1). `userSupplied=true` means
 *  each consumer fills the value locally; the value is stored and returned
 *  verbatim on read (the backend does NOT blank it), so masking is purely
 *  client-side — owners must not type real secrets under a shared key. */
export interface KvEntry {
  key: string
  value: string
  userSupplied: boolean
}

/** Rebuild the structured entries list from a wire map + user_supplied
 *  array. `values` may include the redacted sentinel from a legacy record
 *  that submitted the sentinel literal before the §5.1 relaxation; we
 *  strip it back to "" unconditionally so the input renders blank.
 *
 *  Defensive against a partial wire response that carries `user_supplied`
 *  without a matching entry in the values map (e.g. an empty-collapse
 *  edge case on the server): every user_supplied key surfaces as an empty
 *  toggle-ON row so the operator can still edit / clear it. */
export function entriesFromWire(
  values: Record<string, string> | undefined,
  userSupplied: string[] | undefined,
): KvEntry[] {
  const map = values ?? {}
  const supplied = new Set(userSupplied ?? [])
  const rows: KvEntry[] = Object.entries(map).map(([key, raw]) => ({
    key,
    value: raw === SECRET_PLACEHOLDER_SENTINEL ? '' : raw,
    userSupplied: supplied.has(key),
  }))
  // Surface any user_supplied key the values map forgot (shouldn't happen
  // per current backend, but a benign no-op if it does).
  for (const k of supplied) {
    if (!(k in map)) {
      rows.push({ key: k, value: '', userSupplied: true })
    }
  }
  return rows
}

/** Collapse the structured editor into the wire pair:
 *   - values map keeps `key → value` (real value even under user_supplied —
 *     backend stores it verbatim for owner round-trip since §5.1).
 *   - userSupplied[] is the list of keys the owner flagged as
 *     "consumer fills locally".
 *  Rows with an empty key are dropped so a stray "add" click doesn't emit
 *  `{"": ""}` and confuse validation.
 *
 *  Always emits concrete `{}` / `[]` for empty inputs — a caller that
 *  submits the field with all rows cleared needs the backend to see an
 *  empty map and clear its persisted value. Returning `undefined` here
 *  would collide with the PATCH nil-means-untouched rule and silently
 *  no-op a "delete every row" flow (review finding B1). Callers that want
 *  the field genuinely omitted should not call this at all. */
export function entriesToWire(entries: KvEntry[]): {
  values: Record<string, string>
  userSupplied: string[]
} {
  const values: Record<string, string> = {}
  const userSupplied: string[] = []
  for (const e of entries) {
    const k = e.key.trim()
    if (!k) continue
    values[k] = e.value
    if (e.userSupplied) userSupplied.push(k)
  }
  return { values, userSupplied }
}

/**
 * Turn a caught error from a marketplace admin call into a user-facing
 * message. Beyond the plain `.message`, unpack `details.field` /
 * `details.reason` (single-violation shape from response.go:454) and
 * `details.violations` (multi-violation shape) so a `secret_leaked` reject
 * names the offending row instead of the generic "Secret value must not be
 * submitted". Falls back to the caller's copy when the error isn't an
 * ApiError.
 */
export function describeApiError(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback
  const details = e.details
  const fields: string[] = []
  if (details && typeof details === 'object') {
    if (typeof details.field === 'string') {
      const reason = typeof details.reason === 'string' ? details.reason : ''
      fields.push(reason ? `${details.field} (${reason})` : details.field)
    }
    const violations = (details as { violations?: unknown }).violations
    if (Array.isArray(violations)) {
      for (const v of violations) {
        if (v && typeof v === 'object') {
          const field = (v as { field?: unknown }).field
          const reason = (v as { reason?: unknown }).reason
          if (typeof field === 'string') {
            fields.push(
              typeof reason === 'string' && reason
                ? `${field} (${reason})`
                : field,
            )
          }
        }
      }
    }
  }
  if (fields.length === 0) return e.message
  return `${e.message}: ${fields.join(', ')}`
}

/**
 * Web frontend's `slugifyServerName` reproduced in-place. Same rules so a
 * user typing an identical name on the two consoles lands on the same slug:
 *   - lowercase
 *   - spaces / underscores → hyphen
 *   - anything outside [a-z0-9-] dropped
 *   - collapse consecutive hyphens
 *   - trim leading/trailing hyphens
 *   - cap at 64 chars
 */
function slugifyName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

/**
 * Resolve the slug that a submit should carry. This is a CLIENT-SIDE guard (the
 * unified connector write path has no `slug_required` backend check): a name
 * that can't auto-derive an ASCII slug (e.g. a pure-CJK name → empty) forces the
 * operator to type one instead of silently collapsing to the `mcp-server`
 * default server slug on write.
 *
 *   - A manually entered slug is validated against `^[a-z0-9-]{1,64}$`, then
 *     normalized; a value that PASSES the charset check but normalizes to the
 *     empty string (e.g. `-` or `--`, which `slugifyName` strips to '') is also
 *     rejected as `reason: 'invalid'` so it can't slip through to the fallback.
 *   - An empty manual slug auto-derives from the name; when the name yields no
 *     ASCII slug the result is `reason: 'required'` so the caller blocks submit.
 *   - Otherwise the concrete, already-normalized slug is returned so the write
 *     path never has to fall back to a default server slug.
 */
export function resolveConnectorSlug(
  name: string,
  slug: string,
):
  | { ok: true; slug: string }
  | { ok: false; reason: 'required' | 'invalid' } {
  const raw = (slug ?? '').trim()
  if (raw) {
    if (!/^[a-z0-9-]{1,64}$/.test(raw)) return { ok: false, reason: 'invalid' }
    // Validate the NORMALIZED slug: `-` / `--` pass the charset test but
    // slugifyName collapses them to '', which would otherwise fall back to the
    // `mcp-server` default server slug on write. Reject them here.
    const norm = slugifyName(raw)
    if (!norm) return { ok: false, reason: 'invalid' }
    return { ok: true, slug: norm }
  }
  const derived = slugifyName(name ?? '')
  if (!derived) return { ok: false, reason: 'required' }
  return { ok: true, slug: derived }
}

/**
 * Whether a SEEDED slug (the value hydrated from an existing record) is itself a
 * valid, self-sufficient identity — non-empty, `^[a-z0-9-]{1,64}$`, and
 * normalizing to a non-empty slug. Only such a slug is locked on the edit path;
 * a row seeded with an empty or non-conforming slug stays EDITABLE so the
 * operator can satisfy the required-slug gate instead of being trapped (the
 * field can't be edited AND submit hard-blocks). This is exactly the set
 * `resolveConnectorSlug` accepts for a manual slug — the two must agree so a
 * field left editable can actually pass submit.
 */
export function seededSlugIsValid(slug: string): boolean {
  const raw = (slug ?? '').trim()
  if (!raw) return false
  if (!/^[a-z0-9-]{1,64}$/.test(raw)) return false
  return slugifyName(raw) !== ''
}

/**
 * Form state shape. Distinguished from the wire shape (CreateMcpParams) by
 * a few "raw" text buffers we parse on submit — same pattern as web:
 *   - argsRaw: whitespace-separated command args
 *   - env / headers: structured KV rows (see KvEntry)
 *   - tags: comma-separated in the input; kept as an array in state
 */
interface FormValues {
  name: string
  slug: string
  /** Stored mcpServers JSON key for an existing connector, preserved verbatim
   *  on write so a backend-minted key that differs from the display name / slug
   *  round-trips (review B). Empty for a fresh create → the slug becomes the
   *  key. */
  serverName: string
  /** Extra mcpServers entries the form doesn't model, kept aside on read and
   *  re-emitted verbatim on write so a multi-server document isn't collapsed
   *  (review C). */
  extraServers: Record<string, McpServerEntryWire>
  /** Raw stored modeled-server object, carried through so a metadata edit
   *  preserves keys this form doesn't model (cwd/timeout/disabled/url). Seeded
   *  from the record's quick_start.raw_server; the write seeds the server from
   *  it and overlays the modeled fields on top. */
  rawServer: Record<string, unknown>
  /** Stored connector-package attachments the form doesn't model, carried
   *  through read→write so a metadata edit re-emits them and the wholesale
   *  plugin_json replace doesn't drop them. Empty for a fresh create. */
  extraAttachments: PluginAttachmentWire[]
  category: string
  /** Canonical icon value written back on submit (object key / emoji / URL).
   *  Seeded from the record's canonical `icon`, replaced only by a fresh
   *  upload — NEVER the presigned display URL. */
  icon: string
  /** Resolved display URL used only for the preview tile. Seeded from the
   *  record's `icon_url`; never submitted as the canonical icon. */
  iconUrl: string
  /** Existing publisher, carried through so a metadata edit doesn't blank it. */
  publisher: string
  tags: string[]
  slogan: string
  transport: McpTransport
  url: string
  command: string
  argsRaw: string
  envEntries: KvEntry[]
  headersEntries: KvEntry[]
  tools: McpTool[]
  usage_examples: string[]
  faqs: McpFaq[]
  notes: string[]
  rating: number | null
}

const EMPTY: FormValues = {
  name: '',
  slug: '',
  serverName: '',
  extraServers: {},
  rawServer: {},
  extraAttachments: [],
  category: '',
  icon: '',
  iconUrl: '',
  publisher: '',
  tags: [],
  slogan: '',
  transport: 'streamable-http',
  url: '',
  command: '',
  argsRaw: '',
  envEntries: [],
  headersEntries: [],
  tools: [],
  usage_examples: [],
  faqs: [],
  notes: [],
  rating: null,
}

function isRemote(transport: McpTransport): boolean {
  return transport === 'streamable-http' || transport === 'sse'
}

function detailToValues(d: McpDetail): FormValues {
  const q = d.quick_start
  return {
    name: d.name,
    slug: q.slug || '',
    // Preserve the stored mcpServers key + any unmodeled extra servers so a
    // save round-trips them verbatim (review B / C).
    serverName: q.server_name || '',
    extraServers: q.extra_servers ?? {},
    rawServer: q.raw_server ?? {},
    extraAttachments: q.extra_attachments ?? [],
    category: d.category || '',
    icon: d.icon || '',
    iconUrl: d.icon_url || '',
    publisher: d.publisher || '',
    tags: d.tags || [],
    slogan: d.slogan || '',
    transport: q.transport,
    url: q.url || '',
    command: q.command || '',
    argsRaw: (q.args || []).join(' '),
    envEntries: entriesFromWire(q.env, q.env_user_supplied),
    headersEntries: entriesFromWire(q.headers, q.headers_user_supplied),
    tools: d.tools?.length ? d.tools : [],
    usage_examples: d.usage_examples || [],
    faqs: d.faqs || [],
    notes: d.notes || [],
    rating: d.rating,
  }
}

interface Props {
  open: boolean
  editing: McpDetail | null
  onClose: () => void
  onSaved: (updated: McpDetail) => void
}

export default function McpFormModal({ open, editing, onClose, onSaved }: Props) {
  const { t } = useTranslation(['systemMcp', 'common'])
  const isEdit = !!editing

  const [form, setForm] = useState<FormValues>(EMPTY)
  const [step, setStep] = useState(0)
  const [slugTouched, setSlugTouched] = useState(false)
  // Whether the slug field is locked as immutable identity. Only true on the
  // edit path AND when the SEEDED slug is itself valid — a row seeded with an
  // empty / non-conforming slug stays editable so the operator can fix it
  // (otherwise the field is disabled AND submit hard-blocks on the bad slug).
  // Captured from the seed at open time, not the live form value, so typing a
  // valid slug into an unlocked field never re-locks it mid-edit.
  const [slugLocked, setSlugLocked] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [probing, setProbing] = useState(false)
  const [iconUploading, setIconUploading] = useState(false)
  // Connector categories are free-text rows on the unified taxonomy, not a
  // frozen enum — feed the dropdown from the live list so a category created in
  // the 分类 tab is selectable and a renamed one still matches on write.
  const [categories, setCategories] = useState<McpCategory[]>([])

  // Load the category taxonomy whenever the modal opens. On failure the dropdown
  // simply stays empty; the write path still validates the chosen category id.
  useEffect(() => {
    if (!open) return
    let alive = true
    listMcpCategories()
      .then((rows) => {
        if (alive) setCategories(rows)
      })
      .catch(() => {
        /* dropdown falls back to empty; submit still fails loud on a bad id */
      })
    return () => {
      alive = false
    }
  }, [open])

  // Reset-on-open matches web's behavior (McpCreateModal:364-389). Editing
  // → hydrate from detail; create → start blank; either way step goes back
  // to 0 so a mid-flow re-open never leaks the previous session's state.
  useEffect(() => {
    if (!open) return
    if (editing) {
      const seed = detailToValues(editing)
      setForm(seed)
      // An existing slug counts as user-set so name renames don't clobber it.
      setSlugTouched(!!seed.slug)
      // Lock the slug only when the seeded value is a valid identity; an
      // empty/non-conforming seeded slug stays editable so it can be fixed.
      setSlugLocked(seededSlugIsValid(seed.slug))
      setAdvancedOpen(
        seed.envEntries.length > 0 || seed.headersEntries.length > 0,
      )
    } else {
      setForm(EMPTY)
      setSlugTouched(false)
      setSlugLocked(false)
      setAdvancedOpen(false)
    }
    setStep(0)
  }, [open, editing])

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const onNameChange = (v: string) => {
    setForm((prev) => ({
      ...prev,
      name: v,
      // Only auto-derive slug while the user hasn't manually touched it.
      // Once slugTouched flips true, name edits leave the slug alone.
      slug: slugTouched ? prev.slug : slugifyName(v),
    }))
  }

  const onSlugChange = (v: string) => {
    setSlugTouched(true)
    update('slug', v)
  }

  const remote = isRemote(form.transport)

  // Returns null if the form is submittable. Otherwise returns the first
  // failing field's localized message + the step index that owns it, so
  // callers can jump to the offending step without brittle
  // string-comparison against the localized copy.
  const firstError = (): { message: string; step: number } | null => {
    if (!form.name.trim()) return { message: t('form.nameRequired'), step: 0 }
    // Client-side slug guard: a manual slug must normalize to a valid value, and
    // an empty manual slug must auto-derive a non-empty slug from the name.
    // Otherwise block submit (a pure-CJK name auto-derives to "") rather than
    // silently writing the `mcp-server` default server slug.
    const slugRes = resolveConnectorSlug(form.name, form.slug)
    if (!slugRes.ok) {
      return {
        message:
          slugRes.reason === 'required'
            ? t('form.slugRequired', {
                defaultValue:
                  '名称无法自动生成服务标识，请手动填写（仅限小写字母、数字与连字符）',
              })
            : t('form.slugInvalid', {
                defaultValue:
                  '服务标识只能包含小写字母、数字与连字符，且 1-64 位',
              }),
        step: 0,
      }
    }
    if (remote && !form.url.trim()) {
      return { message: t('form.urlRequired'), step: 1 }
    }
    if (!remote && !form.command.trim()) {
      return { message: t('form.commandRequired'), step: 1 }
    }
    return null
  }

  const goNext = () => {
    // Step 0 requires a name; step 1 requires a valid connection field.
    // Step 2 has no required inputs — everything below it is optional.
    if (step === 0 && !form.name.trim()) {
      message.warning(t('form.nameRequired'))
      return
    }
    if (step === 1) {
      if (remote && !form.url.trim()) {
        message.warning(t('form.urlRequired'))
        return
      }
      if (!remote && !form.command.trim()) {
        message.warning(t('form.commandRequired'))
        return
      }
    }
    setStep((s) => Math.min(s + 1, 2))
  }

  const goPrev = () => setStep((s) => Math.max(s - 1, 0))

  const buildPayload = (): CreateMcpParams => {
    const args =
      !remote && form.argsRaw.trim()
        ? form.argsRaw.trim().split(/\s+/)
        : undefined
    // Both env and headers ride through entriesToWire regardless of the
    // active transport. Gating on `remote` here (as an earlier revision
    // did) drops the OTHER half to `undefined` on a transport-flip PATCH,
    // and backend's `req.Env != nil` guard then preserves stale wire data
    // under the wrong transport — see review finding B2. Web made the same
    // call for identical reasons (McpCreateModal.tsx around L740).
    const envSplit = entriesToWire(form.envEntries)
    const headersSplit = entriesToWire(form.headersEntries)
    // Submit is gated by firstError, so the slug always resolves here. Send the
    // concrete resolved slug (never undefined) so the write path never has to
    // fall back to the `mcp-server` default server slug for a CJK-only name.
    const slugRes = resolveConnectorSlug(form.name, form.slug)
    return {
      name: form.name.trim(),
      slug: slugRes.ok ? slugRes.slug : undefined,
      // Thread the preserved stored key + extra servers straight back so an
      // existing connector's server identity round-trips verbatim (review B / C).
      server_name: form.serverName || undefined,
      extra_servers: Object.keys(form.extraServers).length
        ? form.extraServers
        : undefined,
      // Seed the write from the raw stored server so unmodeled keys
      // (cwd/timeout/disabled/url) survive a metadata edit (review C).
      raw_server: Object.keys(form.rawServer).length ? form.rawServer : undefined,
      // Re-emit stored attachments the form doesn't model so the wholesale
      // plugin_json replace keeps them (Gate 2).
      extra_attachments: form.extraAttachments.length
        ? form.extraAttachments
        : undefined,
      category: form.category,
      icon: form.icon.trim() || undefined,
      // Carry the existing publisher back on edit so the backend's
      // unconditional stamp doesn't blank it. Empty on create → omitted.
      publisher: form.publisher.trim() || undefined,
      tags: form.tags.length ? form.tags : undefined,
      slogan: form.slogan.trim() || undefined,
      transport: form.transport,
      url: remote ? form.url.trim() || undefined : undefined,
      command: !remote ? form.command.trim() || undefined : undefined,
      args,
      env: envSplit.values,
      env_user_supplied: envSplit.userSupplied,
      headers: headersSplit.values,
      headers_user_supplied: headersSplit.userSupplied,
      tools: form.tools.filter((tt) => tt.name.trim()),
      usage_examples: form.usage_examples.filter((s) => s.trim()),
      faqs: form.faqs.filter((f) => f.question.trim()),
      notes: form.notes.filter((n) => n.trim()),
    }
  }

  // ── Probe ──────────────────────────────────────────────────────────────
  // Runs a live MCP handshake against the server described by the form and
  // fills tools[] from the returned tool list. Only remote transports are
  // probable — stdio would need a desktop client to spawn the process
  // (mcp-v1.md §4.7). Backend returns HTTP 200 even on probe failure with
  // is_ok=false + error.code, so we branch on `resp.is_ok`. Payload assembly
  // and error-code → i18n resolution live in probeHelpers so both branches
  // are unit-testable without the wizard.
  const handleProbe = async () => {
    if (!remote) return
    if (!form.url.trim()) {
      message.warning(t('form.urlRequired'))
      return
    }
    // Build probe headers from the KV entries with REAL values (probe is
    // off-record — the actual credentials need to reach the remote MCP or
    // auth fails). Rows with an empty key are dropped so a stray blank
    // slot doesn't send `{"": ""}`.
    const probeHeaders: Record<string, string> = {}
    for (const e of form.headersEntries) {
      const k = e.key.trim()
      if (k) probeHeaders[k] = e.value
    }
    const req = buildProbeRequest({
      transport: form.transport,
      url: form.url,
      headers: probeHeaders,
    })
    if (!req) return
    setProbing(true)
    try {
      const resp = await probeSystemMcp(req)
      if (!resp.is_ok) {
        message.error(resolveProbeErrorMessage(resp, t))
        return
      }
      update('tools', resp.tools)
      message.success(t('form.probeSuccess', { count: resp.tools.length }))
    } catch (e) {
      message.error(
        e instanceof ApiError ? e.message : t('form.probeFailed'),
      )
    } finally {
      setProbing(false)
    }
  }

  const handleSubmit = async () => {
    const err = firstError()
    if (err) {
      message.warning(err.message)
      // Jump to the step that owns the failing field. Step is stamped on
      // the error object at firstError time (never inferred from the
      // localized string) so en-US / zh-CN behave identically.
      setStep(err.step)
      return
    }
    const payload = buildPayload()
    setSubmitting(true)
    try {
      const saved = isEdit && editing
        ? await updateSystemMcp(editing.mcp_id, payload)
        : await createSystemMcp(payload)
      let completed = saved
      if (form.rating !== saved.rating) {
        try {
          await updatePluginRating(saved.mcp_id, form.rating)
          completed = { ...saved, rating: form.rating }
        } catch (ratingError) {
          onSaved(saved)
          message.warning(t('common:pluginRating.partialSuccess'))
          onClose()
          return
        }
      }
      message.success(t(isEdit ? 'modal.updateSuccess' : 'modal.createSuccess'))
      onSaved(completed)
      onClose()
    } catch (e) {
      const fallback = isEdit
        ? t('modal.updateFailed')
        : t('modal.createFailed')
      message.error(describeApiError(e, fallback))
    } finally {
      setSubmitting(false)
    }
  }

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.name, label: c.name })),
    [categories],
  )
  const transportOptions = useMemo(
    () =>
      TRANSPORT_OPTIONS.map((tr) => ({
        value: tr,
        label: t(`transportOptions.${tr}`, { defaultValue: tr }),
      })),
    [t],
  )

  // The preview renders the display URL (icon_url) when present, else the
  // canonical icon (covers emoji + legacy full-URL records). The submitted
  // value stays `form.icon` — the display URL is never written back.
  const iconDisplay = form.iconUrl || form.icon
  const iconIsImage =
    !!iconDisplay &&
    (iconDisplay.startsWith('http') || iconDisplay.startsWith('data:'))

  const iconInputRef = React.useRef<HTMLInputElement | null>(null)

  // ── Icon upload ────────────────────────────────────────────────────────
  // Click on the 72×72 preview tile opens the file picker. Selected file is
  // validated (type + size), then POSTed to marketplace via the two-step
  // presigned-URL flow (see api/mcp.ts#uploadMcpIcon). On success we write
  // the persistent download URL into BOTH form.icon (the canonical value
  // submitted) and form.iconUrl (the preview), so the tile updates and the
  // fresh key is what gets stored.
  const MAX_ICON_BYTES = 2 * 1024 * 1024
  const ALLOWED_ICON_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ])

  const handleIconFile = async (file: File) => {
    if (!ALLOWED_ICON_TYPES.has(file.type)) {
      message.error(t('form.iconTypeError'))
      return
    }
    if (file.size > MAX_ICON_BYTES) {
      message.error(t('form.iconSizeError'))
      return
    }
    setIconUploading(true)
    try {
      const url = await uploadMcpIcon(file)
      // A fresh upload replaces BOTH the canonical value (persistent download
      // URL) and the preview. This is the only path that overwrites the
      // canonical icon; an untouched icon keeps its seeded stored value.
      setForm((prev) => ({ ...prev, icon: url, iconUrl: url }))
    } catch (e) {
      message.error(
        e instanceof ApiError
          ? e.message
          : t('form.iconUploadFailed', { defaultValue: '图标上传失败' }),
      )
    } finally {
      setIconUploading(false)
    }
  }

  const handleIconPickerChange: React.ChangeEventHandler<HTMLInputElement> =
    (e) => {
      const file = e.target.files?.[0]
      // Reset the input so selecting the SAME file again still fires change.
      e.target.value = ''
      if (file) void handleIconFile(file)
    }

  // ── Footer buttons ─────────────────────────────────────────────────────
  // Layout matches web: left = ← 上一步 (hidden on step 0), right = 下一步 →
  // or 提交. The modal's × close button covers "cancel", so we don't repeat
  // a Cancel button in the footer (that was a leftover from a pre-wizard
  // draft — web's wizard has no such button).
  const footer = (
    <div className="mcp-form-footer">
      <div className="mcp-form-footer__left">
        {step > 0 && <Button onClick={goPrev}>← {t('form.prevStep')}</Button>}
      </div>
      <div className="mcp-form-footer__right">
        {step < 2 ? (
          <Button type="primary" onClick={goNext}>
            {t('form.nextStep')} →
          </Button>
        ) : (
          <Button type="primary" loading={submitting} onClick={handleSubmit}>
            {isEdit ? t('modal.save') : t('modal.submit')}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <Modal
      title={isEdit ? t('modal.editTitle') : t('modal.createTitle')}
      open={open}
      onCancel={onClose}
      destroyOnClose
      width={900}
      footer={footer}
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      classNames={{ body: 'mcp-form' }}
      rootClassName="admin-shell"
    >
      <Form component="div" layout="vertical" colon={false}>
      <Steps
        current={step}
        size="small"
        onChange={(s) => {
          // Same tab-jump behavior as web: any step is clickable. Forward
          // jumps still gate through firstError so we don't skip past a
          // required field silently. Uses the error's step index (locale-
          // safe) instead of comparing the localized message.
          if (s > step) {
            const err = firstError()
            if (err && err.step <= step) {
              message.warning(err.message)
              return
            }
          }
          setStep(s)
        }}
        items={[
          { title: t('form.step.basic') },
          { title: t('form.step.connect') },
          { title: t('form.step.docs') },
        ]}
        style={{ marginBottom: 24 }}
      />

      {/* Step 1 — Basic info */}
      {step === 0 && (
        <div className="mcp-form-step">
          <div className="mcp-form-section">
            <div className="mcp-form-section__head">
              <div className="mcp-form-section__title">
                {t('form.sectionBasic')}
              </div>
              <div className="mcp-form-section__desc">
                {t('form.sectionBasicDesc')}
              </div>
            </div>
            <div className="mcp-form-section__body">
              <div className="mcp-form-row mcp-form-row--icon">
                <button
                  type="button"
                  className="mcp-form-icon-preview mcp-form-icon-preview--interactive"
                  onClick={() => iconInputRef.current?.click()}
                  aria-label={t('form.iconUpload')}
                  disabled={iconUploading}
                >
                  {iconUploading ? (
                    <span className="mcp-form-icon-preview__spinner" aria-hidden>
                      ...
                    </span>
                  ) : iconIsImage ? (
                    <img src={iconDisplay} alt="" />
                  ) : (
                    <span>{form.icon || '🧩'}</span>
                  )}
                </button>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleIconPickerChange}
                  style={{ display: 'none' }}
                />
                <div className="mcp-form-row__fields">
                  <Form.Item
                    label={<span>{t('form.name')} <span style={{ color: '#f5222d' }}>*</span></span>}
                    style={{ marginBottom: 12 }}
                  >
                    <Input
                      value={form.name}
                      onChange={(e) => onNameChange(e.target.value)}
                      placeholder={t('form.namePlaceholder')}
                      maxLength={64}
                    />
                  </Form.Item>
                </div>
              </div>

              <Form.Item
                label={t('form.slug')}
                extra={slugLocked ? t('form.slugLockedHint') : t('form.slugHint')}
              >
                <Input
                  value={form.slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                  placeholder={t('form.slugPlaceholder')}
                  maxLength={64}
                  // Slug is the server identity (mcpServers key / connector
                  // source). Editing it on the edit path would desync the stored
                  // key from manifest.name, so lock it — but ONLY when the seeded
                  // slug is valid. A row seeded with an empty/non-conforming slug
                  // stays editable so the operator can satisfy the required-slug
                  // gate instead of being trapped (can't edit, can't submit).
                  disabled={slugLocked}
                />
              </Form.Item>

              <div className="mcp-form-grid mcp-form-grid--2">
                <Form.Item label={t('form.category')}>
                  <Select
                    value={form.category || undefined}
                    onChange={(v) => update('category', v ?? '')}
                    options={categoryOptions}
                    allowClear
                    placeholder={t('form.category')}
                  />
                </Form.Item>
                <Form.Item
                  label={t('form.tags')}
                  extra={t('form.tagsPillHint')}
                >
                  <Select
                    mode="tags"
                    value={form.tags}
                    onChange={(next: string[]) => {
                      // Dedupe + trim in one pass; empty strings dropped.
                      const seen = new Set<string>()
                      const clean: string[] = []
                      for (const raw of next) {
                        const v = (raw ?? '').trim()
                        if (!v || seen.has(v)) continue
                        seen.add(v)
                        clean.push(v)
                      }
                      update('tags', clean)
                    }}
                    tokenSeparators={[',', '，']}
                    placeholder={t('form.tagsPillPlaceholder')}
                    open={false}
                    suffixIcon={null}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>

              <Form.Item label={t('form.slogan')} style={{ marginBottom: 0 }}>
                <Input
                  value={form.slogan}
                  onChange={(e) => update('slogan', e.target.value)}
                  placeholder={t('form.sloganPlaceholder')}
                  maxLength={200}
                />
              </Form.Item>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — Connect config */}
      {step === 1 && (
        <div className="mcp-form-step">
          <div className="mcp-form-section">
            <div className="mcp-form-section__head">
              <div className="mcp-form-section__title">
                {t('form.sectionConnect')}
              </div>
              <div className="mcp-form-section__desc">
                {t('form.sectionConnectDesc')}
              </div>
            </div>
            <div className="mcp-form-section__body">
              <Form.Item label={t('form.transport')}>
                <Select
                  value={form.transport}
                  onChange={(v: McpTransport) => update('transport', v)}
                  options={transportOptions}
                />
              </Form.Item>

              {remote ? (
                <>
                  <Form.Item label={<span>{t('form.url')} <span style={{ color: '#f5222d' }}>*</span></span>}>
                    <Input
                      value={form.url}
                      onChange={(e) => update('url', e.target.value)}
                      placeholder={t('form.urlPlaceholder')}
                      maxLength={2048}
                    />
                  </Form.Item>
                </>
              ) : (
                <>
                  <Form.Item
                    label={<span>{t('form.command')} <span style={{ color: '#f5222d' }}>*</span></span>}
                  >
                    <Input
                      value={form.command}
                      onChange={(e) => update('command', e.target.value)}
                      placeholder={t('form.commandPlaceholder')}
                    />
                  </Form.Item>
                  <Form.Item label={t('form.args')} extra={t('form.argsHint')} style={{ marginBottom: 0 }}>
                    <Input
                      value={form.argsRaw}
                      onChange={(e) => update('argsRaw', e.target.value)}
                      placeholder={t('form.argsPlaceholder')}
                    />
                  </Form.Item>
                </>
              )}

              {/* Advanced (env / headers) collapse — matches web's disclosure. */}
              <div style={{ marginTop: 12 }}>
                <Button
                  type="link"
                  size="small"
                  style={{ paddingLeft: 0 }}
                  onClick={() => setAdvancedOpen((v) => !v)}
                >
                  {advancedOpen ? '▾' : '▸'}{' '}
                  {advancedOpen
                    ? t('form.advancedHide')
                    : t('form.advancedShow')}
                </Button>
              </div>

              {advancedOpen && remote && (
                <Form.Item
                  label={t('form.headers')}
                  extra={t('form.headersHint')}
                  style={{ marginBottom: 0, marginTop: 8 }}
                >
                  <KvEditor
                    entries={form.headersEntries}
                    onChange={(next) => update('headersEntries', next)}
                    keyPlaceholder={t('form.headerKeyPlaceholder')}
                    valuePlaceholder={t('form.headerValuePlaceholder')}
                    valuePlaceholderUserSupplied={t(
                      'form.kvUserSuppliedPlaceholder',
                    )}
                    addLabel={t('form.headerAdd')}
                    removeLabel={t('form.headerRemove')}
                    toggleLabel={t('form.kvUserSuppliedToggle')}
                  />
                </Form.Item>
              )}

              {advancedOpen && !remote && (
                <Form.Item
                  label={t('form.env')}
                  extra={t('form.envHint')}
                  style={{ marginBottom: 0, marginTop: 8 }}
                >
                  <KvEditor
                    entries={form.envEntries}
                    onChange={(next) => update('envEntries', next)}
                    keyPlaceholder={t('form.envKeyPlaceholder')}
                    valuePlaceholder={t('form.envValuePlaceholder')}
                    valuePlaceholderUserSupplied={t(
                      'form.kvUserSuppliedPlaceholder',
                    )}
                    addLabel={t('form.envAdd')}
                    removeLabel={t('form.envRemove')}
                    toggleLabel={t('form.kvUserSuppliedToggle')}
                  />
                </Form.Item>
              )}
            </div>
          </div>

          {/* Tools list section — separate card, with probe button next to +新增 */}
          <div className="mcp-form-section">
            <div className="mcp-form-list-head">
              <div>
                <div className="mcp-form-section__title">
                  {t('form.sectionTools')}
                </div>
                <div className="mcp-form-section__desc">
                  {t('form.sectionToolsDesc')}
                </div>
              </div>
              <div className="mcp-form-list-head__actions">
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    update('tools', [
                      ...form.tools,
                      { name: '', description: '' },
                    ])
                  }
                >
                  {t('form.addOne')}
                </Button>
                {remote && (
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<ThunderboltOutlined />}
                    loading={probing}
                    onClick={handleProbe}
                  >
                    {t('form.probe')}
                  </Button>
                )}
              </div>
            </div>
            <div className="mcp-form-section__body">
              {form.tools.length === 0 ? (
                <div className="mcp-form-empty">
                  {remote
                    ? t('form.toolsProbeHint')
                    : t('form.toolsEmpty')}
                </div>
              ) : (
                form.tools.map((tool, idx) => (
                  <div className="mcp-form-tool" key={idx}>
                    <div className="mcp-form-tool__grow">
                      <Input
                        value={tool.name}
                        placeholder={t('form.toolNamePlaceholder')}
                        onChange={(e) => {
                          const next = [...form.tools]
                          next[idx] = { ...next[idx], name: e.target.value }
                          update('tools', next)
                        }}
                        style={{ marginBottom: 8 }}
                      />
                      <Input
                        value={tool.description}
                        placeholder={t('form.toolDescPlaceholder')}
                        onChange={(e) => {
                          const next = [...form.tools]
                          next[idx] = { ...next[idx], description: e.target.value }
                          update('tools', next)
                        }}
                      />
                    </div>
                    <div className="mcp-form-tool__aside">
                      <span className="mcp-form-tool__idx">#{idx + 1}</span>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() =>
                          update(
                            'tools',
                            form.tools.filter((_, i) => i !== idx),
                          )
                        }
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Docs (system MCPs skip visibility) */}
      {step === 2 && (
        <div className="mcp-form-step">
          <div className="mcp-form-section">
            <div className="mcp-form-section__body">
              <Form.Item label={t('common:pluginMetrics.rating')} extra={t('common:pluginRating.hint')}>
                <Rate value={form.rating ?? 0} onChange={(value) => update('rating', value || null)} />
                {form.rating !== null && (
                  <Button type="link" danger onClick={() => update('rating', null)}>
                    {t('common:pluginRating.clear')}
                  </Button>
                )}
              </Form.Item>
            </div>
          </div>
          <div className="mcp-form-section">
            <SimpleTextList
              title={t('detail.section.examples')}
              desc={t('form.exampleDesc')}
              values={form.usage_examples}
              onChange={(next) => update('usage_examples', next)}
              placeholder={t('form.examplePlaceholder')}
              addLabel={t('form.exampleAdd')}
            />
          </div>
          <div className="mcp-form-section">
            <FaqList
              values={form.faqs}
              onChange={(next) => update('faqs', next)}
              addLabel={t('form.faqAdd')}
              desc={t('form.faqDesc')}
              title={t('detail.section.faqs')}
              qPlaceholder={t('form.faqQuestionPlaceholder')}
              aPlaceholder={t('form.faqAnswerPlaceholder')}
            />
          </div>
          <div className="mcp-form-section">
            <SimpleTextList
              title={t('detail.section.notes')}
              desc={t('form.noteDesc')}
              values={form.notes}
              onChange={(next) => update('notes', next)}
              placeholder={t('form.notePlaceholder')}
              addLabel={t('form.noteAdd')}
            />
          </div>
        </div>
      )}
      </Form>
    </Modal>
  )
}

// ─── Presentation helpers ─────────────────────────────────────────────────

/** Structured Headers / Env editor. One row per key with a per-key toggle
 *  that flags "consumer fills locally" — the form's submit path converts
 *  that flag into the wire's `headers_user_supplied` / `env_user_supplied`
 *  arrays (mcp-v1.md §5.1). Antd-native counterpart of octo-web's KvEditor. */
function KvEditor({
  entries,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  valuePlaceholderUserSupplied,
  addLabel,
  removeLabel,
  toggleLabel,
}: {
  entries: KvEntry[]
  onChange: (next: KvEntry[]) => void
  keyPlaceholder: string
  valuePlaceholder: string
  valuePlaceholderUserSupplied: string
  addLabel: string
  removeLabel: string
  toggleLabel: string
}) {
  const patch = (idx: number, next: Partial<KvEntry>) =>
    onChange(entries.map((e, i) => (i === idx ? { ...e, ...next } : e)))
  const remove = (idx: number) =>
    onChange(entries.filter((_, i) => i !== idx))
  const add = () =>
    onChange([...entries, { key: '', value: '', userSupplied: false }])

  return (
    <div className="mcp-form-kv">
      {entries.map((e, idx) => (
        <div className="mcp-form-kv__row" key={idx}>
          <Input
            className="mcp-form-kv__key"
            value={e.key}
            onChange={(ev) => patch(idx, { key: ev.target.value })}
            placeholder={keyPlaceholder}
            maxLength={128}
          />
          <Input
            className="mcp-form-kv__value"
            value={e.value}
            onChange={(ev) => patch(idx, { value: ev.target.value })}
            placeholder={
              e.userSupplied ? valuePlaceholderUserSupplied : valuePlaceholder
            }
            maxLength={1024}
          />
          <label className="mcp-form-kv__toggle">
            <Switch
              size="small"
              checked={e.userSupplied}
              onChange={(checked) => patch(idx, { userSupplied: checked })}
            />
            <span className="mcp-form-kv__toggle-label">{toggleLabel}</span>
          </label>
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={removeLabel}
            onClick={() => remove(idx)}
          />
        </div>
      ))}
      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={add}
        style={{ marginTop: entries.length ? 4 : 0 }}
      >
        {addLabel}
      </Button>
    </div>
  )
}

function DynamicListHeader({
  title,
  desc,
  onAdd,
}: {
  title: React.ReactNode
  desc?: React.ReactNode
  onAdd: () => void
}) {
  return (
    <div className="mcp-form-list-head">
      <div>
        <div className="mcp-form-list-head__title">{title}</div>
        {desc && <div className="mcp-form-list-head__desc">{desc}</div>}
      </div>
      <Button size="small" icon={<PlusOutlined />} onClick={onAdd}>
        + 新增一条
      </Button>
    </div>
  )
}

function SimpleTextList({
  title,
  desc,
  values,
  onChange,
  placeholder,
  addLabel,
}: {
  title: React.ReactNode
  desc?: React.ReactNode
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  addLabel: string
}) {
  return (
    <div className="mcp-form-list">
      <DynamicListHeader
        title={title}
        desc={desc}
        onAdd={() => onChange([...values, ''])}
      />
      {values.length === 0 ? (
        <div className="mcp-form-empty">
          {`还没有内容，点击右上角「${addLabel}」添加`}
        </div>
      ) : (
        values.map((val, idx) => (
          <div className="mcp-form-mini-row" key={idx}>
            <span className="mcp-form-tool__idx">#{idx + 1}</span>
            <Input
              value={val}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...values]
                next[idx] = e.target.value
                onChange(next)
              }}
              style={{ flex: 1 }}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={() => onChange(values.filter((_, i) => i !== idx))}
            />
          </div>
        ))
      )}
    </div>
  )
}

function FaqList({
  values,
  onChange,
  addLabel,
  desc,
  title,
  qPlaceholder,
  aPlaceholder,
}: {
  values: McpFaq[]
  onChange: (next: McpFaq[]) => void
  addLabel: string
  desc: React.ReactNode
  title: React.ReactNode
  qPlaceholder: string
  aPlaceholder: string
}) {
  return (
    <div className="mcp-form-list">
      <DynamicListHeader
        title={title}
        desc={desc}
        onAdd={() => onChange([...values, { question: '', answer: '' }])}
      />
      {values.length === 0 ? (
        <div className="mcp-form-empty">
          {`还没有内容，点击右上角「${addLabel}」添加`}
        </div>
      ) : (
        values.map((faq, idx) => (
          <div className="mcp-form-faq" key={idx}>
            <div className="mcp-form-faq__head">
              <span className="mcp-form-tool__idx">#{idx + 1}</span>
              <Button
                type="text"
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => onChange(values.filter((_, i) => i !== idx))}
              />
            </div>
            <Input
              value={faq.question}
              placeholder={qPlaceholder}
              onChange={(e) => {
                const next = [...values]
                next[idx] = { ...next[idx], question: e.target.value }
                onChange(next)
              }}
              style={{ marginBottom: 8 }}
            />
            <Input.TextArea
              rows={2}
              value={faq.answer}
              placeholder={aPlaceholder}
              onChange={(e) => {
                const next = [...values]
                next[idx] = { ...next[idx], answer: e.target.value }
                onChange(next)
              }}
            />
          </div>
        ))
      )}
    </div>
  )
}
