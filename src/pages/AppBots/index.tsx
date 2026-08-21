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
  Alert,
} from 'antd'
import { PlusOutlined, SearchOutlined, RobotOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  listAppBots,
  listSpaceAppBots,
  type AppBotScopeFilter,
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

// Ownership filter, platform console only. 'platform' is the default so the page opens on
// exactly what it has always shown; a server without scope support answers the same way
// for every option, which degrades to that same platform-only list instead of erroring.
const scopeOptions = (t: TFunction) => [
  { value: 'platform', label: t('list.scopeFilter.platform') },
  { value: 'space', label: t('list.scopeFilter.space') },
  { value: 'all', label: t('list.scopeFilter.all') },
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
  const [scopeFilter, setScopeFilter] = useState<AppBotScopeFilter>('platform')
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
        : await listAppBots({ ...params, scope: scopeFilter })
      setData(resp.list || [])
      setTotal(resp.count || 0)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedKeyword, statusFilter, scopeFilter, spaceId])

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
    ...(spaceId
      ? []
      : [
          {
            // Which space owns this bot. Without it, a listing that spans scopes cannot be
            // read: two bots look identical while only one of them is manageable here.
            title: t('column.ownership'),
            key: 'ownership',
            width: 160,
            render: (_: unknown, record: AppBot) =>
              record.scope === 'space' ? (
                <Tag color="blue">{record.space_name || record.space_id || t('scope.space')}</Tag>
              ) : (
                <Tag>{t('scope.platform')}</Tag>
              ),
          } as ColumnsType<AppBot>[number],
        ]),
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
          {!spaceId && (
            <Select
              value={scopeFilter}
              onChange={(v) => { setScopeFilter(v); setPage(1) }}
              options={scopeOptions(t)}
              style={{ width: 130 }}
            />
          )}
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

      {!spaceId && scopeFilter === 'platform' && (
        // 这张表只列平台级 Bot（服务端 /v1/admin/app_bot 按 scope 过滤，见 botInRouteScope
        // 的跨租户防护）。空间级 Bot 在各自空间的控制台管理。没有这句提示时，
        // 一个被移到空间的 Bot 会从这页凭空消失，用户无从知道它去哪了。
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('list.platformOnly.title')}
          description={
            <span>
              {t('list.platformOnly.desc')}{' '}
              <Typography.Link href="/admin/space">{t('list.platformOnly.link')}</Typography.Link>
            </span>
          }
        />
      )}

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
