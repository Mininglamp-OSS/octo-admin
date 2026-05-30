import { useEffect, useState } from 'react'
import {
  Table,
  Button,
  Modal,
  Tooltip,
  Typography,
  Form,
  InputNumber,
  DatePicker,
  Checkbox,
  Select,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import type { InviteListItem, SpaceScope } from '../../hooks/useSpaceScope'
import { getUser } from '../../api/space-user'

const { Text } = Typography

interface Props {
  spaceId: string
  scope: SpaceScope
  readOnly?: boolean
}

type StatusFilter = '1' | '0' | 'all'

const PAGE_SIZE = 20

interface EditorState {
  open: boolean
  mode: 'create' | 'edit'
  code: string | null
  initial: EditorFormValues
}

interface EditorFormValues {
  no_limit?: boolean
  max_uses?: number
  expires_at?: Dayjs | null
}

const DEFAULT_EXPIRES = (): Dayjs => dayjs().add(7, 'day')

function buildInviteLink(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/?invite=${encodeURIComponent(code)}&action=login`
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}

const EXPIRES_PRESETS: ReadonlyArray<{ labelKey: string; days: number | null }> = [
  { labelKey: 'invites.editor.preset.7d', days: 7 },
  { labelKey: 'invites.editor.preset.14d', days: 14 },
  { labelKey: 'invites.editor.preset.30d', days: 30 },
  { labelKey: 'invites.editor.preset.never', days: null },
]

function matchPreset(value: Dayjs | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return null
  for (const p of EXPIRES_PRESETS) {
    if (p.days === null) continue
    const target = dayjs().add(p.days, 'day')
    if (Math.abs(value.diff(target, 'minute')) <= 1) return p.days
  }
  return undefined
}

export default function SpaceInvitesPanel({ spaceId, scope, readOnly = false }: Props) {
  const { t } = useTranslation(['spaces', 'common'])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<InviteListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    mode: 'create',
    code: null,
    initial: {},
  })
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorForm] = Form.useForm<EditorFormValues>()

  const canManage = !readOnly && scope.canManageInvites
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({})

  const resolveCreators = async (items: InviteListItem[]) => {
    const uids = Array.from(
      new Set(
        items
          .map((x) => x.creator)
          .filter((uid): uid is string => !!uid && !userNameMap[uid]),
      ),
    )
    if (uids.length === 0) return
    const results = await Promise.allSettled(uids.map((uid) => getUser(uid)))
    const next: Record<string, string> = {}
    results.forEach((r, i) => {
      const uid = uids[i]
      if (r.status === 'fulfilled') {
        next[uid] = r.value.name || r.value.username || ''
      }
    })
    if (Object.keys(next).length > 0) {
      setUserNameMap((prev) => ({ ...prev, ...next }))
    }
  }

  const fetchData = async (nextPage = page, filter = statusFilter) => {
    setLoading(true)
    try {
      const res = await scope.api.listInvites(spaceId, {
        page_index: nextPage,
        page_size: PAGE_SIZE,
        status: filter,
      })
      const list = res.list || []
      setData(list)
      setTotal(res.count || 0)
      resolveCreators(list)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    fetchData(1, statusFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, scope.kind, statusFilter])

  const openCreate = () => {
    setEditor({
      open: true,
      mode: 'create',
      code: null,
      initial: { no_limit: true, expires_at: DEFAULT_EXPIRES() },
    })
  }

  const openEdit = (record: InviteListItem) => {
    setEditor({
      open: true,
      mode: 'edit',
      code: record.invite_code,
      initial: {
        no_limit: record.max_uses === 0,
        max_uses: record.max_uses > 0 ? record.max_uses : undefined,
        expires_at: record.expires_at ? dayjs(record.expires_at) : DEFAULT_EXPIRES(),
      },
    })
  }

  const handleEditorSubmit = async () => {
    const values = await editorForm.validateFields()
    const expires = values.expires_at
      ? values.expires_at.second(0).format('YYYY-MM-DD HH:mm:ss')
      : ''
    const maxUses = values.no_limit ? 0 : values.max_uses
    setEditorLoading(true)
    try {
      if (editor.mode === 'create') {
        const resp = await scope.api.createInvite(spaceId, {
          max_uses: maxUses,
          expires_at: expires || undefined,
        })
        const copied = await copyText(buildInviteLink(resp.invite_code))
        message.success(
          copied
            ? t('invites.submit.linkCopied', { code: resp.invite_code })
            : t('invites.submit.generated', { code: resp.invite_code }),
        )
      } else if (editor.code) {
        await scope.api.updateInvite(spaceId, editor.code, {
          max_uses: maxUses,
          expires_at: expires,
        })
        message.success(t('invites.submit.saved'))
      }
      setEditor({ open: false, mode: 'create', code: null, initial: {} })
      fetchData()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setEditorLoading(false)
    }
  }

  const handleEnable = (code: string) => {
    Modal.confirm({
      title: t('invites.enable.title', { code }),
      onOk: async () => {
        try {
          await scope.api.updateInvite(spaceId, code, { status: 1 })
          message.success(t('invites.enable.success'))
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleDisable = (code: string) => {
    Modal.confirm({
      title: t('invites.disable.title', { code }),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await scope.api.disableInvite(spaceId, code)
          message.success(t('invites.disable.success'))
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleCopyLink = async (code: string) => {
    const link = buildInviteLink(code)
    const ok = await copyText(link)
    if (ok) {
      message.success(t('invites.copyLink.success'))
    } else {
      message.error(t('invites.copyLink.error'))
    }
  }

  const actionColumn = !canManage
    ? null
    : ({
        title: t('invites.column.action'),
        key: 'action',
        width: 260,
        render: (_: unknown, record: InviteListItem) => (
          <div className="row-actions" style={{ display: 'inline-flex', gap: 6 }}>
            <Button
              size="small"
              type="text"
              icon={<LinkOutlined />}
              onClick={() => handleCopyLink(record.invite_code)}
              disabled={record.status !== 1}
            >
              {t('invites.action.copyLink')}
            </Button>
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            >
              {t('invites.action.edit')}
            </Button>
            {record.status === 1 ? (
              <Button
                size="small"
                type="text"
                danger
                icon={<StopOutlined />}
                onClick={() => handleDisable(record.invite_code)}
              >
                {t('invites.action.disable')}
              </Button>
            ) : (
              <Button
                size="small"
                type="text"
                style={{ color: 'var(--a-success)' }}
                icon={<PlayCircleOutlined />}
                onClick={() => handleEnable(record.invite_code)}
              >
                {t('invites.action.enable')}
              </Button>
            )}
          </div>
        ),
      })

  const baseColumns: ColumnsType<InviteListItem> = [
    {
      title: t('invites.column.code'),
      dataIndex: 'invite_code',
      key: 'invite_code',
      width: 180,
      ellipsis: true,
      render: (code) => (
        <Tooltip title={code} mouseEnterDelay={0.2}>
          <Text
            copyable={{ text: code }}
            className="mono cell-primary"
            style={{ maxWidth: 160 }}
            ellipsis
          >
            {code}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: t('invites.column.status'),
      key: 'status',
      width: 110,
      render: (_, record) => {
        if (record.status !== 1) {
          return (
            <span className="pill-icon destroyed">
              <StopOutlined />
              {t('invites.status.disabled')}
            </span>
          )
        }
        if (record.expires_at && dayjs(record.expires_at).isBefore(dayjs())) {
          return (
            <span className="pill-icon banned">
              <ClockCircleOutlined />
              {t('invites.status.expired')}
            </span>
          )
        }
        if (record.max_uses > 0 && record.used_count >= record.max_uses) {
          return (
            <span className="pill-icon banned">
              <ExclamationCircleOutlined />
              {t('invites.status.usedUp')}
            </span>
          )
        }
        return (
          <span className="pill-icon online">
            <CheckCircleOutlined />
            {t('invites.status.valid')}
          </span>
        )
      },
    },
    {
      title: t('invites.column.usage'),
      key: 'usage',
      width: 110,
      render: (_, record) => {
        const max = record.max_uses === 0 ? '∞' : record.max_uses
        return (
          <span className="mono" style={{ color: 'var(--a-text-secondary)' }}>
            {record.used_count}<span style={{ color: 'var(--a-text-quaternary)' }}>/</span>{max}
          </span>
        )
      },
    },
    {
      title: t('invites.column.expiresAt'),
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 150,
      render: (value: string) => {
        if (!value) {
          return <span style={{ color: 'var(--a-text-quaternary)' }}>{t('invites.expires.permanent')}</span>
        }
        const expired = dayjs(value).isBefore(dayjs())
        return (
          <span style={{ color: expired ? 'var(--a-danger)' : 'var(--a-text-secondary)' }}>
            {value}
          </span>
        )
      },
    },
    {
      title: t('invites.column.creator'),
      dataIndex: 'creator',
      key: 'creator',
      width: 140,
      ellipsis: true,
      render: (uid: string) => {
        if (!uid) return <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>
        const name = userNameMap[uid]
        return (
          <Tooltip title={uid} mouseEnterDelay={0.2}>
            <span className="cell-primary">
              {name || <span style={{ color: 'var(--a-text-tertiary)' }}>{t('invites.creator.loading')}</span>}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: t('invites.column.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (value) => <span style={{ color: 'var(--a-text-tertiary)' }}>{value}</span>,
    },
  ]

  const columns: ColumnsType<InviteListItem> = actionColumn
    ? [...baseColumns, { ...actionColumn, align: 'right' as const }]
    : baseColumns

  return (
    <div>
      <div className="toolbar toolbar-plain">
        <Select<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 130 }}
          options={[
            { value: '1', label: t('invites.filter.valid') },
            { value: '0', label: t('invites.filter.disabled') },
            { value: 'all', label: t('invites.filter.all') },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
          {t('common:action.refresh')}
        </Button>
        <div className="toolbar-spacer" />
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t('invites.generate')}
          </Button>
        )}
      </div>
      <Table<InviteListItem>
        columns={columns}
        dataSource={data}
        rowKey="invite_code"
        loading={loading}
        size="middle"
        scroll={{ x: 'max-content' }}
        pagination={
          total > PAGE_SIZE
            ? {
                current: page,
                total,
                pageSize: PAGE_SIZE,
                showTotal: (count) => t('common:table.total', { count }),
                onChange: (p) => {
                  setPage(p)
                  fetchData(p)
                },
              }
            : false
        }
      />

      <Modal
        title={editor.mode === 'create' ? t('invites.editor.createTitle') : t('invites.editor.editTitle')}
        open={editor.open}
        onOk={handleEditorSubmit}
        onCancel={() => setEditor({ open: false, mode: 'create', code: null, initial: {} })}
        confirmLoading={editorLoading}
        okText={editor.mode === 'create' ? t('invites.editor.createOk') : t('invites.editor.editOk')}
        destroyOnClose
      >
        <Form
          form={editorForm}
          layout="vertical"
          preserve={false}
          initialValues={editor.initial}
        >
          <Form.Item label={t('invites.editor.maxUsesLabel')} style={{ marginBottom: 8 }}>
            <Form.Item name="no_limit" valuePropName="checked" noStyle>
              <Checkbox>{t('invites.editor.noLimit')}</Checkbox>
            </Form.Item>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.no_limit !== c.no_limit}>
            {({ getFieldValue }) =>
              !getFieldValue('no_limit') && (
                <Form.Item
                  name="max_uses"
                  rules={[
                    { required: true, message: t('invites.editor.maxUsesRequired') },
                    {
                      type: 'integer',
                      min: 1,
                      message: t('invites.editor.maxUsesInteger'),
                    },
                  ]}
                >
                  <InputNumber
                    min={1}
                    precision={0}
                    style={{ width: '100%' }}
                    placeholder={t('invites.editor.maxUsesPlaceholder')}
                  />
                </Form.Item>
              )
            }
          </Form.Item>

          <Form.Item label={t('invites.editor.expiresLabel')} style={{ marginBottom: 8 }}>
            <Form.Item
              noStyle
              shouldUpdate={(p, c) => p.expires_at !== c.expires_at}
            >
              {({ getFieldValue }) => {
                const current = getFieldValue('expires_at') as Dayjs | null | undefined
                const active = matchPreset(current)
                return (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {EXPIRES_PRESETS.map((preset) => {
                      const isActive = active === preset.days
                      return (
                        <Button
                          key={preset.labelKey}
                          size="small"
                          type={isActive ? 'primary' : 'default'}
                          onClick={() =>
                            editorForm.setFieldValue(
                              'expires_at',
                              preset.days === null ? null : dayjs().add(preset.days, 'day'),
                            )
                          }
                        >
                          {t(preset.labelKey)}
                        </Button>
                      )
                    })}
                  </div>
                )
              }}
            </Form.Item>
            <Form.Item
              name="expires_at"
              noStyle
              rules={[
                {
                  validator: (_r, value: Dayjs | null | undefined) => {
                    if (!value) return Promise.resolve()
                    return value.isAfter(dayjs())
                      ? Promise.resolve()
                      : Promise.reject(new Error(t('invites.editor.expiresAfterNow')))
                  },
                },
              ]}
            >
              <DatePicker
                showTime={{ format: 'HH:mm' }}
                format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }}
                placeholder={t('invites.editor.expiresPlaceholder')}
              />
            </Form.Item>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
