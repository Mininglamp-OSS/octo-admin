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
import {
  listAppBots,
  listSpaceAppBots,
  deleteAppBot,
  deleteSpaceAppBot,
  publishAppBot,
  publishSpaceAppBot,
  unpublishAppBot,
  unpublishSpaceAppBot,
  type AppBot,
  type AppBotStatus,
} from '../../api/app-bot'
import CreateModal from './CreateModal'
import EditModal from './EditModal'
import DetailDrawer from './DetailDrawer'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

const STATUS_MAP: Record<AppBotStatus, { label: string; color: string }> = {
  0: { label: '草稿', color: 'default' },
  1: { label: '已上架', color: 'green' },
  2: { label: '已下架', color: 'orange' },
}

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: '0', label: '草稿' },
  { value: '1', label: '已上架' },
  { value: '2', label: '已下架' },
]

interface Props {
  spaceId?: string
}

export default function AppBotsPage({ spaceId }: Props) {
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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

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
      message.success('已删除')
      fetchList()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const handleTogglePublish = async (bot: AppBot) => {
    try {
      if (bot.status === 1) {
        spaceId ? await unpublishSpaceAppBot(spaceId, bot.id) : await unpublishAppBot(bot.id)
        message.success('已下架')
      } else {
        spaceId ? await publishSpaceAppBot(spaceId, bot.id) : await publishAppBot(bot.id)
        message.success('已上架')
      }
      fetchList()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const columns: ColumnsType<AppBot> = [
    {
      title: '应用 Bot',
      key: 'bot',
      width: 260,
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar
            src={record.avatar || undefined}
            icon={!record.avatar ? <RobotOutlined /> : undefined}
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
      title: 'UID',
      dataIndex: 'uid',
      width: 180,
      render: (uid: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{uid}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: AppBotStatus) => {
        const s = STATUS_MAP[status]
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <a onClick={() => setEditBot(record)}>编辑</a>
          <a onClick={() => setDetailId(record.id)}>Token</a>
          <Popconfirm
            title={record.status === 1 ? '确认下架？' : '确认上架？'}
            description={
              record.status === 1
                ? '下架后用户将不可见此 Bot。'
                : '上架后用户可在应用入口发现此 Bot。'
            }
            onConfirm={() => handleTogglePublish(record)}
            okText="确认"
            cancelText="取消"
          >
            <a>{record.status === 1 ? '下架' : '上架'}</a>
          </Popconfirm>
          <Popconfirm
            title="确认删除？"
            description="将物理删除此 Bot 并清理 IM 连接，不可恢复。"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <a style={{ color: 'var(--ant-color-error, #ff4d4f)' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {spaceId ? 'Space 应用 Bot' : '平台应用 Bot'}
        </Typography.Title>
        <Space>
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1) }}
            options={STATUS_OPTIONS}
            style={{ width: 120 }}
          />
          <Input
            placeholder="搜索名称或 ID..."
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
            创建
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
          showTotal: (t) => `共 ${t} 个`,
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
      />

      <DetailDrawer
        botId={detailId}
        spaceId={spaceId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  )
}
