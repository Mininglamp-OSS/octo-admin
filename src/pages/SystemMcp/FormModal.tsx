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
  Radio,
  Select,
  Steps,
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
  probeSystemMcp,
  updateSystemMcp,
  uploadMcpIcon,
  type CreateMcpParams,
  type McpAuthType,
  type McpDetail,
  type McpFaq,
  type McpTool,
  type McpTransport,
} from '../../api/mcp'
import {
  buildProbeRequest,
  resolveProbeErrorMessage,
} from './probeHelpers'

const { TextArea } = Input

const CATEGORY_KEYS = [
  'dev',
  'data',
  'search',
  'productivity',
  'ai',
  'other',
] as const

const TRANSPORT_OPTIONS: McpTransport[] = ['streamable-http', 'sse', 'stdio']

// Marketplace-shared sentinel (octo-marketplace/docs/api/mcp-v1.md §0 /
// §5.1). When bearer auth is declared but the operator hasn't pasted a
// real token in the Headers block, we persist this placeholder so the
// wire contract holds: "bearer auth → Authorization present, empty or
// sentinel means the downstream user should substitute their own token".
// The ephemeral probe field is deliberately separate and never seeded here.
const SECRET_PLACEHOLDER_SENTINEL = '__OCTO_SECRET_PLACEHOLDER__'
const AUTHORIZATION_HEADER_KEYS = ['authorization', 'Authorization']

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
 * Form state shape. Distinguished from the wire shape (CreateMcpParams) by
 * a few "raw" text buffers we parse on submit — same pattern as web:
 *   - argsRaw: whitespace-separated command args
 *   - envRaw / headersRaw: `key=value\n...` and `key: value\n...` blocks
 *   - tags: comma-separated in the input; kept as an array in state
 */
interface FormValues {
  name: string
  slug: string
  category: string
  icon: string
  tags: string[]
  slogan: string
  transport: McpTransport
  url: string
  authType: McpAuthType
  command: string
  argsRaw: string
  envRaw: string
  headersRaw: string
  tools: McpTool[]
  usageExamples: string[]
  faqs: McpFaq[]
  notes: string[]
}

const EMPTY: FormValues = {
  name: '',
  slug: '',
  category: 'dev',
  icon: '',
  tags: [],
  slogan: '',
  transport: 'streamable-http',
  url: '',
  authType: 'none',
  command: '',
  argsRaw: '',
  envRaw: '',
  headersRaw: '',
  tools: [],
  usageExamples: [],
  faqs: [],
  notes: [],
}

function isRemote(transport: McpTransport): boolean {
  return transport === 'streamable-http' || transport === 'sse'
}

function parseKV(raw: string, sep: '=' | ':'): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(sep)
    if (idx === -1) continue
    const k = trimmed.slice(0, idx).trim()
    const v = trimmed.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

function serializeKV(
  m: Record<string, string> | undefined,
  sep: '=' | ': ',
): string {
  if (!m) return ''
  return Object.keys(m)
    .sort()
    .map((k) => `${k}${sep}${m[k] ?? ''}`)
    .join('\n')
}

function detailToValues(d: McpDetail): FormValues {
  const q = d.quickStart
  return {
    name: d.name,
    slug: q.slug || '',
    category: d.category || 'dev',
    icon: d.icon || '',
    tags: d.tags || [],
    slogan: d.slogan || '',
    transport: q.transport,
    url: q.url || '',
    authType: q.authType || 'none',
    command: q.command || '',
    argsRaw: (q.args || []).join(' '),
    envRaw: serializeKV(q.env, '='),
    headersRaw: serializeKV(q.headers, ': '),
    tools: d.tools?.length ? d.tools : [],
    usageExamples: d.usageExamples || [],
    faqs: d.faqs || [],
    notes: d.notes || [],
  }
}

interface Props {
  open: boolean
  editing: McpDetail | null
  onClose: () => void
  onSaved: (updated?: McpDetail) => void
}

export default function McpFormModal({ open, editing, onClose, onSaved }: Props) {
  const { t } = useTranslation(['systemMcp', 'common'])
  const isEdit = !!editing

  const [form, setForm] = useState<FormValues>(EMPTY)
  const [step, setStep] = useState(0)
  const [slugTouched, setSlugTouched] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [probing, setProbing] = useState(false)
  const [iconUploading, setIconUploading] = useState(false)
  // Ephemeral bearer token consumed only by the probe call; NEVER included
  // in the create/update payload. Lets the operator paste a real token to
  // fetch the tool list while the saved config keeps the sentinel
  // placeholder that mcp-v1.md §5.1 requires. Not seeded from `editing` —
  // real values never round-trip to the client.
  const [probeBearer, setProbeBearer] = useState('')

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
      setAdvancedOpen(
        !!seed.envRaw.trim() || !!seed.headersRaw.trim(),
      )
    } else {
      setForm(EMPTY)
      setSlugTouched(false)
      setAdvancedOpen(false)
    }
    // Probe bearer is per-session and never re-used across opens.
    setProbeBearer('')
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
    if (form.slug && !/^[a-z0-9-]{1,64}$/.test(form.slug)) {
      return {
        message: t('form.slugInvalid', {
          defaultValue: '服务标识只能包含小写字母、数字与连字符，且 1-64 位',
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
    const env =
      !remote && form.envRaw
        ? (() => {
            const kv = parseKV(form.envRaw, '=')
            return Object.keys(kv).length ? kv : undefined
          })()
        : undefined
    const headers = (() => {
      if (!remote) return undefined
      const parsed = form.headersRaw ? parseKV(form.headersRaw, ':') : {}
      // Uphold the documented invariant (mcp-v1.md §5.1): when bearer auth
      // is declared, the persisted record MUST carry an Authorization
      // header. If the operator didn't supply one — most likely because
      // they only pasted a token into the ephemeral "test-only" field for
      // the probe call, or because the Advanced block was collapsed — we
      // stamp the shared sentinel so downstream consumers see a slot to
      // fill in rather than a silent no-auth misconfiguration.
      if (form.authType === 'bearer') {
        const hasAuth = AUTHORIZATION_HEADER_KEYS.some((k) => k in parsed)
        if (!hasAuth) parsed.Authorization = SECRET_PLACEHOLDER_SENTINEL
      }
      return Object.keys(parsed).length ? parsed : undefined
    })()
    return {
      name: form.name.trim(),
      // Auto-derived slug already fills; on manual override we've kept the
      // user's value. slugifyName is idempotent, so an already-clean value
      // survives untouched.
      slug: form.slug ? slugifyName(form.slug) : undefined,
      category: form.category,
      icon: form.icon.trim() || undefined,
      tags: form.tags.length ? form.tags : undefined,
      slogan: form.slogan.trim() || undefined,
      transport: form.transport,
      url: remote ? form.url.trim() || undefined : undefined,
      authType: remote ? form.authType : undefined,
      command: !remote ? form.command.trim() || undefined : undefined,
      args,
      env,
      headers,
      tools: form.tools.filter((tt) => tt.name.trim()),
      usageExamples: form.usageExamples.filter((s) => s.trim()),
      faqs: form.faqs.filter((f) => f.question.trim()),
      notes: form.notes.filter((n) => n.trim()),
    }
  }

  // ── Probe ──────────────────────────────────────────────────────────────
  // Runs a live MCP handshake against the server described by the form and
  // fills tools[] from the returned tool list. Only remote transports are
  // probable — stdio would need a desktop client to spawn the process
  // (mcp-v1.md §4.7). Backend returns HTTP 200 even on probe failure with
  // ok=false + error.code, so we branch on `resp.ok`. Payload assembly and
  // error-code → i18n resolution live in probeHelpers so both branches are
  // unit-testable without the wizard.
  const handleProbe = async () => {
    if (!remote) return
    if (!form.url.trim()) {
      message.warning(t('form.urlRequired'))
      return
    }
    const req = buildProbeRequest({
      transport: form.transport,
      url: form.url,
      authType: form.authType,
      headersRaw: form.headersRaw,
      probeBearer,
    })
    if (!req) return
    setProbing(true)
    try {
      const resp = await probeSystemMcp(req)
      if (!resp.ok) {
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
      if (isEdit && editing) {
        const updated = await updateSystemMcp(editing.id, payload)
        message.success(t('modal.updateSuccess'))
        onSaved(updated)
      } else {
        await createSystemMcp(payload)
        message.success(t('modal.createSuccess'))
        onSaved()
      }
      onClose()
    } catch (e) {
      const fallback = isEdit
        ? t('modal.updateFailed')
        : t('modal.createFailed')
      message.error(e instanceof ApiError ? e.message : fallback)
    } finally {
      setSubmitting(false)
    }
  }

  const categoryOptions = useMemo(
    () =>
      CATEGORY_KEYS.map((k) => ({
        value: k,
        label: t(`categoryOptions.${k}`, { defaultValue: k }),
      })),
    [t],
  )
  const transportOptions = useMemo(
    () =>
      TRANSPORT_OPTIONS.map((tr) => ({
        value: tr,
        label: t(`transportOptions.${tr}`, { defaultValue: tr }),
      })),
    [t],
  )

  const iconIsImage =
    !!form.icon &&
    (form.icon.startsWith('http') || form.icon.startsWith('data:'))

  const iconInputRef = React.useRef<HTMLInputElement | null>(null)

  // ── Icon upload ────────────────────────────────────────────────────────
  // Click on the 72×72 preview tile opens the file picker. Selected file is
  // validated (type + size), then POSTed to marketplace via the two-step
  // presigned-URL flow (see api/mcp.ts#uploadMcpIcon). On success we write
  // the persistent download URL back into form.icon — same field the emoji /
  // manual URL input feeds, so downstream code doesn't care about the source.
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
      update('icon', url)
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
                    <img src={form.icon} alt="" />
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
                extra={t('form.slugHint')}
              >
                <Input
                  value={form.slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                  placeholder={t('form.slugPlaceholder')}
                  maxLength={64}
                />
              </Form.Item>

              <div className="mcp-form-grid mcp-form-grid--2">
                <Form.Item label={t('form.category')}>
                  <Select
                    value={form.category}
                    onChange={(v) => update('category', v)}
                    options={categoryOptions}
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
                  <Form.Item label={t('form.authType')} style={{ marginBottom: 0 }}>
                    <Radio.Group
                      value={form.authType}
                      onChange={(e) => {
                        const next = e.target.value as McpAuthType
                        update('authType', next)
                        // Bearer implies a persisted Authorization header
                        // (defaulted to the sentinel by buildPayload). Auto-
                        // open the Advanced block so the operator sees that
                        // slot and can override it with a real shared token
                        // if they want to. Selecting `none` doesn't collapse
                        // — anything the operator has already typed stays
                        // visible.
                        if (next === 'bearer' && !advancedOpen) {
                          setAdvancedOpen(true)
                        }
                      }}
                      buttonStyle="solid"
                      className="mcp-form-segmented"
                    >
                      <Radio.Button value="none">{t('form.authTypeNone')}</Radio.Button>
                      <Radio.Button value="bearer">
                        {t('form.authTypeBearer')}
                      </Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  {form.authType === 'bearer' && (
                    <Form.Item
                      label={t('form.probeBearerLabel')}
                      extra={t('form.probeBearerHint')}
                      style={{ marginBottom: 0, marginTop: 12 }}
                    >
                      <Input.Password
                        value={probeBearer}
                        onChange={(e) => setProbeBearer(e.target.value)}
                        placeholder={t('form.probeBearerPlaceholder')}
                        autoComplete="off"
                      />
                    </Form.Item>
                  )}
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
                  <TextArea
                    rows={3}
                    value={form.headersRaw}
                    onChange={(e) => update('headersRaw', e.target.value)}
                    placeholder={t('form.headersPlaceholder')}
                  />
                </Form.Item>
              )}

              {advancedOpen && !remote && (
                <Form.Item
                  label={t('form.env')}
                  extra={t('form.envHint')}
                  style={{ marginBottom: 0, marginTop: 8 }}
                >
                  <TextArea
                    rows={3}
                    value={form.envRaw}
                    onChange={(e) => update('envRaw', e.target.value)}
                    placeholder={t('form.envPlaceholder')}
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
            <SimpleTextList
              title={t('detail.section.examples')}
              desc={t('form.exampleDesc')}
              values={form.usageExamples}
              onChange={(next) => update('usageExamples', next)}
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
