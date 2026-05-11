// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Octo Contributors

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

const EXPIRES_PRESETS: ReadonlyArray<{ label: string; days: number | null }> = [
  { label: '7 天', days: 7 },
  { label: '14 天', days: 14 },
  { label: '30 天', days: 30 },
  { label: '永不过期', days: null },
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
            ? `邀请链接已复制到剪贴板 (code: ${resp.invite_code})`
            : `邀请码已生成：${resp.invite_code}`,
        )
      } else if (editor.code) {
        await scope.api.updateInvite(spaceId, editor.code, {
          max_uses: maxUses,
          expires_at: expires,
        })
        message.success('已保存')
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
      title: `确认启用邀请码 ${code}？`,
      onOk: async () => {
        try {
          await scope.api.updateInvite(spaceId, code, { status: 1 })
          message.success('已启用')
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleDisable = (code: string) => {
    Modal.confirm({
      title: `确认禁用邀请码 ${code}？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await scope.api.disableInvite(spaceId, code)
          message.success('已禁用')
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
      message.success('邀请链接已复制')
    } else {
      message.error('复制失败,请手动选中')
    }
  }

  const actionColumn = !canManage
    ? null
    : ({
        title: '操作',
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
              复制链接
            </Button>
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            >
              编辑
            </Button>
            {record.status === 1 ? (
              <Button
                size="small"
                type="text"
                danger
                icon={<StopOutlined />}
                onClick={() => handleDisable(record.invite_code)}
              >
                禁用
              </Button>
            ) : (
              <Button
                size="small"
                type="text"
                style={{ color: 'var(--a-success)' }}
                icon={<PlayCircleOutlined />}
                onClick={() => handleEnable(record.invite_code)}
              >
                启用
              </Button>
            )}
          </div>
        ),
      })

  const baseColumns: ColumnsType<InviteListItem> = [
    {
      title: '邀请码',
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
      title: '状态',
      key: 'status',
      width: 110,
      render: (_, record) => {
        if (record.status !== 1) {
          return (
            <span className="pill-icon destroyed">
              <StopOutlined />
              已禁用
            </span>
          )
        }
        if (record.expires_at && dayjs(record.expires_at).isBefore(dayjs())) {
          return (
            <span className="pill-icon banned">
              <ClockCircleOutlined />
              已过期
            </span>
          )
        }
        if (record.max_uses > 0 && record.used_count >= record.max_uses) {
          return (
            <span className="pill-icon banned">
              <ExclamationCircleOutlined />
              已用完
            </span>
          )
        }
        return (
          <span className="pill-icon online">
            <CheckCircleOutlined />
            有效
          </span>
        )
      },
    },
    {
      title: '使用情况',
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
      title: '过期时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 150,
      render: (t: string) => {
        if (!t) {
          return <span style={{ color: 'var(--a-text-quaternary)' }}>永久</span>
        }
        const expired = dayjs(t).isBefore(dayjs())
        return (
          <span style={{ color: expired ? 'var(--a-danger)' : 'var(--a-text-secondary)' }}>
            {t}
          </span>
        )
      },
    },
    {
      title: '创建者',
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
              {name || <span style={{ color: 'var(--a-text-tertiary)' }}>加载中…</span>}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (t) => <span style={{ color: 'var(--a-text-tertiary)' }}>{t}</span>,
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
            { value: '1', label: '仅有效' },
            { value: '0', label: '仅禁用' },
            { value: 'all', label: '全部' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
          刷新
        </Button>
        <div className="toolbar-spacer" />
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            生成邀请码
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
                showTotal: (t) => `共 ${t} 条`,
                onChange: (p) => {
                  setPage(p)
                  fetchData(p)
                },
              }
            : false
        }
      />

      <Modal
        title={editor.mode === 'create' ? '生成邀请码' : '编辑邀请码'}
        open={editor.open}
        onOk={handleEditorSubmit}
        onCancel={() => setEditor({ open: false, mode: 'create', code: null, initial: {} })}
        confirmLoading={editorLoading}
        okText={editor.mode === 'create' ? '生成' : '保存'}
        destroyOnClose
      >
        <Form
          form={editorForm}
          layout="vertical"
          preserve={false}
          initialValues={editor.initial}
        >
          <Form.Item label="使用次数上限" style={{ marginBottom: 8 }}>
            <Form.Item name="no_limit" valuePropName="checked" noStyle>
              <Checkbox>不限次数</Checkbox>
            </Form.Item>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.no_limit !== c.no_limit}>
            {({ getFieldValue }) =>
              !getFieldValue('no_limit') && (
                <Form.Item
                  name="max_uses"
                  rules={[
                    { required: true, message: '请输入使用次数' },
                    {
                      type: 'integer',
                      min: 1,
                      message: '必须是不小于 1 的整数',
                    },
                  ]}
                >
                  <InputNumber
                    min={1}
                    precision={0}
                    style={{ width: '100%' }}
                    placeholder="请输入使用次数"
                  />
                </Form.Item>
              )
            }
          </Form.Item>

          <Form.Item label="过期时间" style={{ marginBottom: 8 }}>
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
                          key={preset.label}
                          size="small"
                          type={isActive ? 'primary' : 'default'}
                          onClick={() =>
                            editorForm.setFieldValue(
                              'expires_at',
                              preset.days === null ? null : dayjs().add(preset.days, 'day'),
                            )
                          }
                        >
                          {preset.label}
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
                      : Promise.reject(new Error('过期时间需晚于当前时间'))
                  },
                },
              ]}
            >
              <DatePicker
                showTime={{ format: 'HH:mm' }}
                format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }}
                placeholder="自定义过期时间"
              />
            </Form.Item>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
