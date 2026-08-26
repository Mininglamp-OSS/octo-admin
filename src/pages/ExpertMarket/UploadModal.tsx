/**
 * Batch upload-to-create modal shared by the Expert and Squad tabs.
 *
 * Accepts one or many container zips in a single session. `expectKind` binds
 * the modal to its tab: a file whose manifest kind doesn't match is marked
 * invalid (never blocks the rest). Every file is parsed client-side
 * (parseExpertContainer) into a review table for PREVIEW/VALIDATION only — kind
 * check, category/tags prefill, and package/member counts. Confirming uploads
 * each valid entry's WHOLE container zip to the server-side importer
 * (importExpertContainer → POST /admin/plugins/import); the backend unzips it,
 * mints the expert/team plugin + its bundled skills, and wires the relations.
 * A per-entry failure marks that row retryable and continues with the next.
 */

import { useRef, useState } from 'react'
import { Alert, Button, message, Modal, Select, Table, Tag, Typography, Upload } from 'antd'
import { CopyOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import type { RcFile } from 'antd/es/upload'
import { ApiError } from '../../api'
import {
  importExpertContainer,
  type ExpertCategory,
  type ExpertKind,
} from '../../api/expert'
import {
  ContainerError,
  parseExpertContainer,
  type ParsedContainer,
  type ParsedExpert,
  type ParsedSquad,
} from './parseContainer'
import { buildAiPrompt } from './aiPrompt'

const { Dragger } = Upload
const { Text, Paragraph } = Typography

type EntryStatus = 'parsing' | 'ready' | 'invalid' | 'saving' | 'done' | 'failed'

interface ImportEntry {
  key: string
  fileName: string
  /** The original container zip — uploaded verbatim to the server importer. */
  file: File
  parsed: ParsedContainer | null
  status: EntryStatus
  /** Parse or import failure reason, shown under the status tag. */
  error: string | null
  /** Per-row overrides, initialized from the manifest. */
  category?: string
  tags: string[]
}

interface Props {
  open: boolean
  expectKind: ExpertKind
  categories: ExpertCategory[]
  onClose: () => void
  /** Fired once ≥1 entry was created, so the tab list refreshes even on a
   *  partial failure (the modal stays open for retrying the rest). */
  onImported: () => void
}

/** Resolve a ContainerError to a localized string, falling back to its raw
 *  message when a key isn't translated yet. */
function useContainerErrorText() {
  const { t } = useTranslation(['expertMarket'])
  return (err: unknown): string => {
    if (err instanceof ContainerError) {
      return t(`container.${err.code}`, { defaultValue: err.message })
    }
    if (err instanceof ApiError) return err.message
    return (err as Error)?.message ?? String(err)
  }
}

const STATUS_TAG: Record<EntryStatus, { color: string; key: string }> = {
  parsing: { color: 'processing', key: 'list.statusParsing' },
  ready: { color: 'blue', key: 'list.statusReady' },
  invalid: { color: 'red', key: 'list.statusInvalid' },
  saving: { color: 'processing', key: 'list.statusSaving' },
  done: { color: 'green', key: 'list.statusDone' },
  failed: { color: 'red', key: 'list.statusFailed' },
}

export default function UploadModal({
  open,
  expectKind,
  categories,
  onClose,
  onImported,
}: Props) {
  const { t, i18n } = useTranslation(['expertMarket', 'common'])
  const [entries, setEntries] = useState<ImportEntry[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const errText = useContainerErrorText()

  const updateEntry = (key: string, patch: Partial<ImportEntry>) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)))
  }

  const reset = () => {
    setEntries([])
    setProgress(null)
  }

  const handleClose = () => {
    // While a batch is in flight, Cancel/X aborts the current upload instead
    // of closing (a hung PUT would otherwise wedge the modal until timeout).
    if (submitting) {
      abortRef.current?.abort()
      return
    }
    reset()
    onClose()
  }

  const copyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildAiPrompt(expectKind, i18n.language))
      message.success(t('aiHelp.copied'))
    } catch {
      message.error(t('aiHelp.copyFailed'))
    }
  }

  const addFile = async (file: RcFile) => {
    const key = file.uid
    setEntries((prev) => [
      ...prev,
      { key, fileName: file.name, file, parsed: null, status: 'parsing', error: null, tags: [] },
    ])
    try {
      const parsed = await parseExpertContainer(file)
      if (parsed.manifest.kind !== expectKind) {
        updateEntry(key, {
          status: 'invalid',
          error: t('container.kindMismatch', {
            defaultValue: 'Container kind does not match this tab.',
          }),
        })
        return
      }
      updateEntry(key, {
        parsed,
        status: 'ready',
        category: parsed.manifest.category || undefined,
        tags: parsed.manifest.tags,
      })
    } catch (err) {
      updateEntry(key, { status: 'invalid', error: errText(err) })
    }
  }

  const handleSubmit = async () => {
    const pending = entries.filter(
      (e): e is ImportEntry & { parsed: ParsedContainer } =>
        (e.status === 'ready' || e.status === 'failed') && e.parsed !== null
    )
    if (pending.length === 0) {
      message.error(t('upload.zipRequired'))
      return
    }
    setSubmitting(true)
    const ctl = new AbortController()
    abortRef.current = ctl
    let ok = 0
    let fail = 0
    for (let i = 0; i < pending.length; i++) {
      const entry = pending[i]
      if (ctl.signal.aborted) break
      updateEntry(entry.key, { status: 'saving', error: null })
      setProgress(
        t('upload.importing', {
          done: i + 1,
          total: pending.length,
          name: entry.parsed.manifest.name,
        })
      )
      try {
        // The whole container zip is uploaded to the server importer, which
        // unzips it and mints the expert/team plugin + its bundled skills. The
        // selected category (a name) is resolved to a unified category id in
        // the client; tags come from the manifest inside the zip.
        await importExpertContainer(entry.file, {
          kind: expectKind,
          categoryName: entry.category,
          signal: ctl.signal,
        })
        updateEntry(entry.key, { status: 'done' })
        ok += 1
      } catch (err) {
        if (ctl.signal.aborted) {
          // Nothing was committed for this entry — put it back in line.
          updateEntry(entry.key, { status: 'ready', error: null })
          break
        }
        updateEntry(entry.key, { status: 'failed', error: errText(err) })
        fail += 1
      }
    }
    abortRef.current = null
    setSubmitting(false)
    setProgress(null)
    if (ok > 0) onImported()
    if (ctl.signal.aborted) {
      message.info(t('upload.cancelled'))
      return
    }
    if (fail === 0) {
      message.success(t('upload.successCount', { count: ok }))
      reset()
      onClose()
    } else {
      message.warning(t('upload.partial', { ok, fail }))
    }
  }

  const importableCount = entries.filter(
    (e) => e.status === 'ready' || e.status === 'failed'
  ).length
  // Submitting while a file is still unzipping would silently drop it on the
  // all-success close path — hold the button until every parse settles.
  const parsingCount = entries.filter((e) => e.status === 'parsing').length

  const columns: ColumnsType<ImportEntry> = [
    {
      title: t('list.name'),
      key: 'name',
      render: (_, e) => (
        <div>
          <div>{e.parsed?.manifest.name ?? e.fileName}</div>
          {e.parsed && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {e.fileName}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t('list.packages'),
      key: 'packages',
      width: 70,
      align: 'right',
      render: (_, e) => <span className="mono">{e.parsed?.skillFiles.size ?? '—'}</span>,
    },
    {
      title: t('list.category'),
      key: 'category',
      width: 150,
      render: (_, e) =>
        e.parsed && (
          <Select
            allowClear
            size="small"
            style={{ width: '100%' }}
            placeholder={t('list.categoryPlaceholder')}
            value={e.category}
            disabled={submitting || e.status === 'done'}
            onChange={(v) => updateEntry(e.key, { category: v })}
            options={categories.map((c) => ({ value: c.name, label: c.name }))}
          />
        ),
    },
    {
      title: t('list.tags'),
      key: 'tags',
      width: 190,
      render: (_, e) =>
        e.parsed && (
          <Select
            mode="tags"
            size="small"
            style={{ width: '100%' }}
            placeholder={t('list.tagsPlaceholder')}
            value={e.tags}
            disabled={submitting || e.status === 'done'}
            onChange={(v) => updateEntry(e.key, { tags: v })}
          />
        ),
    },
    {
      title: t('list.status'),
      key: 'status',
      width: 110,
      render: (_, e) => (
        <div>
          <Tag color={STATUS_TAG[e.status].color} style={{ margin: 0 }}>
            {t(STATUS_TAG[e.status].key)}
          </Tag>
          {e.error && (
            <div>
              <Text type="danger" style={{ fontSize: 12 }}>
                {e.error}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      width: 48,
      render: (_, e) =>
        e.status !== 'done' && (
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={submitting}
            onClick={() => setEntries((prev) => prev.filter((x) => x.key !== e.key))}
          />
        ),
    },
  ]

  return (
    <Modal
      open={open}
      title={t(expectKind === 'squad' ? 'upload.titleSquad' : 'upload.titleExpert')}
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText={
        importableCount > 0
          ? t('upload.submitCount', { count: importableCount })
          : t('upload.submit')
      }
      okButtonProps={{ disabled: importableCount === 0 || parsingCount > 0 }}
      cancelButtonProps={{ danger: submitting }}
      width={800}
      destroyOnClose
    >
      {entries.length === 0 && (
        <Alert
          type="info"
          showIcon
          message={t('aiHelp.title')}
          description={t(expectKind === 'squad' ? 'aiHelp.descSquad' : 'aiHelp.descExpert')}
          action={
            <Button size="small" icon={<CopyOutlined />} onClick={() => void copyAiPrompt()}>
              {t('aiHelp.copy')}
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Dragger
        accept=".zip,.skill"
        multiple
        showUploadList={false}
        disabled={submitting}
        beforeUpload={(file) => {
          void addFile(file)
          return false
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-hint">
          {t(expectKind === 'squad' ? 'upload.zipHintSquad' : 'upload.zipHintExpert')}
        </p>
      </Dragger>

      {entries.length > 0 && (
        <Table<ImportEntry>
          rowKey="key"
          size="small"
          columns={columns}
          dataSource={entries}
          pagination={false}
          style={{ marginTop: 16 }}
          expandable={{
            expandedRowRender: (e) =>
              e.parsed ? <ContainerPreview parsed={e.parsed} /> : null,
            rowExpandable: (e) => e.parsed !== null,
          }}
        />
      )}

      {progress && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {progress}
        </Text>
      )}
    </Modal>
  )
}

function ContainerPreview({ parsed }: { parsed: ParsedContainer }) {
  const m = parsed.manifest
  return (
    <div className="exp-preview">
      <div className="exp-preview__head">
        <span className="exp-preview__tile">{m.short_name || m.name.slice(0, 2)}</span>
        <div className="exp-preview__meta">
          <div className="exp-preview__name">{m.name}</div>
          <div className="exp-preview__summary">{m.summary}</div>
        </div>
      </div>
      {m.kind === 'agent' ? (
        <ExpertPreviewBody m={m} />
      ) : (
        <SquadPreviewBody m={m} />
      )}
    </div>
  )
}

function SkillNames({ skills }: { skills: { name: string; file?: string }[] }) {
  const { t } = useTranslation(['expertMarket'])
  if (!skills.length) return <Text type="secondary">{t('detail.noSkills')}</Text>
  return (
    <div className="exp-preview__tags">
      {skills.map((s, i) => (
        <Tag key={`${s.name}-${i}`} className="pill-outline neutral" style={{ margin: 0 }}>
          {s.name}
          {s.file ? ' 📦' : ''}
        </Tag>
      ))}
    </div>
  )
}

function ExpertPreviewBody({ m }: { m: ParsedExpert }) {
  const { t } = useTranslation(['expertMarket'])
  return (
    <dl className="exp-kv">
      <dt>{t('detail.instruction')}</dt>
      <dd>
        <Paragraph ellipsis={{ rows: 3 }} style={{ margin: 0 }}>
          {m.instruction}
        </Paragraph>
      </dd>
      <dt>{t('detail.skills')}</dt>
      <dd>
        <SkillNames skills={m.skills} />
      </dd>
    </dl>
  )
}

function SquadPreviewBody({ m }: { m: ParsedSquad }) {
  const { t } = useTranslation(['expertMarket'])
  return (
    <dl className="exp-kv">
      <dt>{t('detail.leader')}</dt>
      <dd>{m.leader}</dd>
      <dt>{t('detail.members')}</dt>
      <dd>
        <div className="exp-preview__tags">
          {m.members.map((mem) => (
            <Tag
              key={mem.member_key}
              className={mem.is_leader ? 'pill-outline brand' : 'pill-outline neutral'}
              style={{ margin: 0 }}
            >
              {mem.name}
              {mem.role ? ` · ${mem.role}` : ''}
            </Tag>
          ))}
        </div>
      </dd>
      {m.strategies.length > 0 && (
        <>
          <dt>{t('detail.strategies')}</dt>
          <dd>
            <ol className="exp-strategies">
              {m.strategies.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </dd>
        </>
      )}
    </dl>
  )
}
