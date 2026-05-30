import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Table,
  Button,
  Tag,
  Space,
  Input,
  Select,
  Popconfirm,
  message,
  Typography,
  Avatar,
} from 'antd'
import { PlusOutlined, SearchOutlined, RobotOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  listAppBots,
  listSpaceAppBots,
  deleteAppBot,
  deleteSpaceAppBot,
  publishAppBot,
  publishSpaceAppBot,
  unpublishAppBot,
  unpublishSpaceAppBot,
  botAvatarUrl,
  type AppBot,
  type AppBotStatus,
} from '../../api/app-bot'
import CreateModal from './CreateModal'
import EditModal from './EditModal'
import DetailDrawer from './DetailDrawer'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

const STATUS_COLOR: Record<AppBotStatus, string> = {
  0: 'default',
  1: 'green',
  2: 'orange',
}

const statusLabel = (t: TFunction, status: AppBotStatus): string => {
  if (status === 1) return t('status.published')
  if (status === 2) return t('status.unpublished')
  return t('status.draft')
}

const statusOptions = (t: TFunction) => [
  { value: '', label: t('list.statusFilter.all') },
  { value: '0', label: t('status.draft') },
  { value: '1', label: t('status.published') },
  { value: '2', label: t('status.unpublished') },
]

interface Props {
  spaceId?: string
}

export default function AppBotsPage({ spaceId }: Props) {
  const { t } = useTranslation(['appBots', 'common'])
  const [data, setData] = useState<AppBot[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editBot, setEditBot] = useState<AppBot | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [avatarVersionMap, setAvatarVersionMap] = useState<Record<string, number>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const handleAvatarUploaded = (uid: string) => {
    setAvatarVersionMap((prev) => ({ ...prev, [uid]: Date.now() }))
  }

  // Debounce keyword input
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedKeyword(keyword)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [keyword])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page_index: page,
        page_size: PAGE_SIZE,
        keyword: debouncedKeyword || undefined,
        status: statusFilter !== '' ? Number(statusFilter) : undefined,
      }
      const resp = spaceId
        ? await listSpaceAppBots(spaceId, params)
        : await listAppBots(params)
      setData(resp.list || [])
      setTotal(resp.count || 0)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedKeyword, statusFilter, spaceId])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleDelete = async (id: string) => {
    try {
      spaceId ? await deleteSpaceAppBot(spaceId, id) : await deleteAppBot(id)
      message.success(t('list.toast.deleted'))
      fetchList()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const handleTogglePublish = async (bot: AppBot) => {
    try {
      if (bot.status === 1) {
        spaceId ? await unpublishSpaceAppBot(spaceId, bot.id) : await unpublishAppBot(bot.id)
        message.success(t('list.toast.unpublished'))
      } else {
        spaceId ? await publishSpaceAppBot(spaceId, bot.id) : await publishAppBot(bot.id)
        message.success(t('list.toast.published'))
      }
      fetchList()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const columns: ColumnsType<AppBot> = [
    {
      title: t('column.bot'),
      key: 'bot',
      width: 260,
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar
            src={botAvatarUrl(record.uid, avatarVersionMap[record.uid])}
            icon={<RobotOutlined />}
            size={36}
            style={{ background: '#6366f1', flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <a onClick={() => setDetailId(record.id)}>{record.display_name}</a>
            </div>
            <div style={{ fontSize: 12, color: 'var(--a-text-tertiary, #999)', fontFamily: 'monospace' }}>
              {record.id}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: t('column.uid'),
      dataIndex: 'uid',
      width: 180,
      render: (uid: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{uid}</span>
      ),
    },
    {
      title: t('column.status'),
      dataIndex: 'status',
      width: 90,
      render: (status: AppBotStatus) => (
        <Tag color={STATUS_COLOR[status]}>{statusLabel(t, status)}</Tag>
      ),
    },
    {
      title: t('column.createdAt'),
      dataIndex: 'created_at',
      width: 170,
    },
    {
      title: t('column.action'),
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <a onClick={() => setEditBot(record)}>{t('action.edit')}</a>
          <a onClick={() => setDetailId(record.id)}>{t('action.token')}</a>
          <Popconfirm
            title={record.status === 1 ? t('confirm.unpublish.title') : t('confirm.publish.title')}
            description={
              record.status === 1
                ? t('confirm.unpublish.desc')
                : t('confirm.publish.desc')
            }
            onConfirm={() => handleTogglePublish(record)}
            okText={t('confirm.ok')}
            cancelText={t('confirm.cancel')}
          >
            <a>{record.status === 1 ? t('action.unpublish') : t('action.publish')}</a>
          </Popconfirm>
          <Popconfirm
            title={t('confirm.delete.title')}
            description={t('confirm.delete.desc')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('confirm.delete.ok')}
            cancelText={t('confirm.cancel')}
          >
            <a style={{ color: 'var(--ant-color-error, #ff4d4f)' }}>{t('action.delete')}</a>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {spaceId ? t('list.title.space') : t('list.title.platform')}
        </Typography.Title>
        <Space>
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1) }}
            options={statusOptions(t)}
            style={{ width: 120 }}
          />
          <Input
            placeholder={t('list.search.placeholder')}
            prefix={<SearchOutlined />}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => { setDebouncedKeyword(keyword); setPage(1) }}
            style={{ width: 200 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            {t('list.create')}
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          onChange: setPage,
          showTotal: (count) => t('list.total', { count }),
          showSizeChanger: false,
        }}
        size="middle"
      />

      <CreateModal
        open={createOpen}
        spaceId={spaceId}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { setCreateOpen(false); fetchList() }}
      />

      <EditModal
        bot={editBot}
        spaceId={spaceId}
        open={!!editBot}
        onClose={() => setEditBot(null)}
        onSuccess={() => { setEditBot(null); fetchList() }}
        onAvatarUploaded={handleAvatarUploaded}
      />

      <DetailDrawer
        botId={detailId}
        spaceId={spaceId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        onAvatarUploaded={handleAvatarUploaded}
      />
    </div>
  )
}
