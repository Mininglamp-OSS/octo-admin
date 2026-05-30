import { useEffect, useState } from 'react'
import { Table, Button, Select, Modal, Tooltip, Typography, message } from 'antd'

const { Text } = Typography
import { ReloadOutlined, CheckOutlined, CloseOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import type { JoinApplyStatus } from '../../api/space'
import type { JoinApplyItem, SpaceScope } from '../../hooks/useSpaceScope'

interface Props {
  spaceId: string
  scope: SpaceScope
  readOnly?: boolean
}

const PAGE_SIZE = 20

const STATUS_META: Record<
  JoinApplyStatus,
  { textKey: string; tone: 'warning' | 'online' | 'banned'; icon: React.ReactNode }
> = {
  0: { textKey: 'applies.status.pending', tone: 'warning', icon: <ClockCircleOutlined /> },
  1: { textKey: 'applies.status.approved', tone: 'online', icon: <CheckOutlined /> },
  2: { textKey: 'applies.status.rejected', tone: 'banned', icon: <CloseOutlined /> },
}

type StatusFilter = 'all' | JoinApplyStatus

export default function SpaceJoinAppliesPanel({ spaceId, scope, readOnly = false }: Props) {
  const { t } = useTranslation(['spaces', 'common'])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<JoinApplyItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    scope.supportsApplyFilter ? 'all' : 0,
  )

  const canReview = !readOnly && scope.canReviewApplies

  const fetchData = async (nextPage = page, filter = statusFilter) => {
    setLoading(true)
    try {
      const res = await scope.api.listJoinApplies(spaceId, {
        page_index: nextPage,
        page_size: PAGE_SIZE,
        status: filter === 'all' ? undefined : filter,
      })
      setData(res.list || [])
      setTotal(res.count || 0)
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

  const handleApprove = (id: number, name: string) => {
    Modal.confirm({
      title: t('applies.approve.title', { name }),
      onOk: async () => {
        try {
          await scope.api.approveJoinApply(spaceId, id)
          message.success(t('applies.approve.success'))
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleReject = (id: number, name: string) => {
    Modal.confirm({
      title: t('applies.reject.title', { name }),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await scope.api.rejectJoinApply(spaceId, id)
          message.success(t('applies.reject.success'))
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const actionColumn = !canReview
    ? null
    : ({
        title: t('applies.column.action'),
        key: 'action',
        width: 140,
        render: (_: unknown, record: JoinApplyItem) =>
          record.status === 0 ? (
            <div className="row-actions" style={{ display: 'inline-flex', gap: 6 }}>
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handleApprove(record.id, record.applicant_name)}
              >
                {t('applies.action.approve')}
              </Button>
              <Button
                size="small"
                type="text"
                danger
                icon={<CloseOutlined />}
                onClick={() => handleReject(record.id, record.applicant_name)}
              >
                {t('applies.action.reject')}
              </Button>
            </div>
          ) : (
            <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>
          ),
      })

  const statusColumn: ColumnsType<JoinApplyItem>[number] | null = scope.supportsApplyFilter
    ? {
        title: t('applies.column.status'),
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: JoinApplyStatus) => {
          const meta = STATUS_META[status]
          return (
            <span className={`pill-icon ${meta.tone}`}>
              {meta.icon}
              {t(meta.textKey)}
            </span>
          )
        },
      }
    : null

  const baseColumns: ColumnsType<JoinApplyItem> = [
    {
      title: t('applies.column.applicant'),
      dataIndex: 'applicant_name',
      key: 'applicant_name',
      render: (name) => <span className="cell-primary">{name}</span>,
    },
    {
      title: t('applies.column.uid'),
      dataIndex: 'uid',
      key: 'uid',
      width: 200,
      render: (uid) => (
        <Tooltip title={uid} mouseEnterDelay={0.2}>
          <Text
            copyable={{ text: uid }}
            style={{ maxWidth: 180, color: 'var(--a-text-tertiary)' }}
            className="mono"
            ellipsis
          >
            {uid}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: t('applies.column.inviteCode'),
      dataIndex: 'invite_code',
      key: 'invite_code',
      width: 140,
      render: (code: string) =>
        code ? (
          <span className="mono" style={{ color: 'var(--a-text-secondary)' }}>{code}</span>
        ) : (
          <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>
        ),
    },
    {
      title: t('applies.column.remark'),
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (r) => r || <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>,
    },
    ...(statusColumn ? [statusColumn] : []),
    {
      title: t('applies.column.appliedAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (t) => <span style={{ color: 'var(--a-text-tertiary)' }}>{t}</span>,
    },
  ]

  const columns: ColumnsType<JoinApplyItem> = actionColumn
    ? [...baseColumns, { ...actionColumn, align: 'right' as const }]
    : baseColumns

  return (
    <div>
      <div className="toolbar toolbar-plain">
        {scope.supportsApplyFilter ? (
          <Select<StatusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: t('applies.filter.all') },
              { value: 0, label: t('applies.filter.pending') },
              { value: 1, label: t('applies.filter.approved') },
              { value: 2, label: t('applies.filter.rejected') },
            ]}
          />
        ) : (
          <span className="filter-chip">
            <ClockCircleOutlined />
            {t('applies.pendingOnly')}
          </span>
        )}
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
          {t('common:action.refresh')}
        </Button>
      </div>
      <Table<JoinApplyItem>
        columns={columns}
        dataSource={data}
        rowKey="id"
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
    </div>
  )
}
