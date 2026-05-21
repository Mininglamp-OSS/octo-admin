import { useEffect, useMemo, useState } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Tooltip,
  message,
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  LinkOutlined,
  AndroidOutlined,
  AppleOutlined,
  GlobalOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../api'

interface AppVersion {
  id: number
  app_version: string
  os: string
  is_force: number
  update_desc: string
  download_url: string
  created_at: string
}

type PlatformFilter = 'all' | 'android' | 'ios' | 'web' | 'openclaw-plugin'
type ForceFilter = 'all' | 'yes' | 'no'

const osOptions = [
  { label: 'Android', value: 'android' },
  { label: 'iOS', value: 'ios' },
  { label: 'Web', value: 'web' },
  { label: 'Windows', value: 'windows' },
  { label: 'macOS', value: 'macos' },
  { label: 'Linux', value: 'linux' },
]

const WEB_PLATFORMS = new Set(['windows', 'macos', 'linux', 'web'])

interface PlatformMeta {
  label: string
  icon: React.ReactNode
  tone: 'ios' | 'android' | 'web' | 'plugin' | 'neutral'
}

function platformMeta(os: string): PlatformMeta {
  if (os === 'ios') return { label: 'iOS', icon: <AppleOutlined />, tone: 'ios' }
  if (os === 'android') return { label: 'Android', icon: <AndroidOutlined />, tone: 'android' }
  if (os === 'web') return { label: 'Web', icon: <GlobalOutlined />, tone: 'web' }
  if (os === 'windows') return { label: 'Windows', icon: <GlobalOutlined />, tone: 'web' }
  if (os === 'macos') return { label: 'macOS', icon: <GlobalOutlined />, tone: 'web' }
  if (os === 'linux') return { label: 'Linux', icon: <GlobalOutlined />, tone: 'web' }
  if (os === 'openclaw-plugin') return { label: 'OpenClaw', icon: <ApiOutlined />, tone: 'plugin' }
  return { label: os.toUpperCase(), icon: null, tone: 'neutral' }
}

function formatUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.host + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return url
  }
}

export default function Download() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AppVersion[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all')
  const [forceFilter, setForceFilter] = useState<ForceFilter>('all')
  const [modalVisible, setModalVisible] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form] = Form.useForm()

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page_index: page.toString(),
        page_size: '20',
      })
      const res = await api.get(`/v1/common/appversion/list?${params}`)
      setData(res.data.list || [])
      setTotal(res.data.count || 0)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page])

  const filteredData = useMemo(() => {
    return data.filter((v) => {
      if (forceFilter === 'yes' && v.is_force !== 1) return false
      if (forceFilter === 'no' && v.is_force === 1) return false
      if (platformFilter === 'all') return true
      if (platformFilter === 'web') return WEB_PLATFORMS.has(v.os)
      return v.os === platformFilter
    })
  }, [data, platformFilter, forceFilter])

  const handleAdd = () => {
    setEditingId(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: AppVersion) => {
    setEditingId(record.id)
    form.setFieldsValue({
      app_version: record.app_version,
      os: record.os,
      is_force: record.is_force === 1,
      update_desc: record.update_desc,
      download_url: record.download_url,
    })
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload = {
      ...values,
      is_force: values.is_force ? 1 : 0,
    }
    try {
      if (editingId) {
        await api.put(`/v1/manager/download/versions/${editingId}`, payload)
        message.success('更新成功')
      } else {
        await api.post('/v1/common/appversion', payload)
        message.success('添加成功')
      }
      setModalVisible(false)
      fetchData()
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const columns: ColumnsType<AppVersion> = [
    {
      title: '版本号',
      dataIndex: 'app_version',
      key: 'app_version',
      width: 140,
      render: (v) => <span className="cell-primary mono">{v}</span>,
    },
    {
      title: '平台',
      dataIndex: 'os',
      key: 'os',
      width: 120,
      render: (os) => {
        const meta = platformMeta(os)
        return (
          <span className={`pill-outline ${meta.tone}`}>
            {meta.icon}
            {meta.label}
          </span>
        )
      },
    },
    {
      title: '强制更新',
      dataIndex: 'is_force',
      key: 'is_force',
      width: 100,
      align: 'center',
      render: (v) =>
        v === 1 ? (
          <span className="pill-outline danger">强制</span>
        ) : (
          <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>
        ),
    },
    {
      title: '更新说明',
      dataIndex: 'update_desc',
      key: 'update_desc',
      ellipsis: true,
      render: (v) => (
        <Tooltip title={v} mouseEnterDelay={0.3}>
          <span style={{ color: 'var(--a-text-secondary)' }}>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: '下载地址',
      dataIndex: 'download_url',
      key: 'download_url',
      width: 260,
      ellipsis: true,
      render: (url) =>
        url ? (
          <Tooltip title={url} mouseEnterDelay={0.2}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mono"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <LinkOutlined style={{ fontSize: 11 }} />
              {formatUrl(url)}
            </a>
          </Tooltip>
        ) : (
          <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (t) => <span style={{ color: 'var(--a-text-tertiary)' }}>{t}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      align: 'right',
      render: (_, record) => (
        <div className="row-actions">
          <Button
            size="small"
            className="btn-row-edit"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">下载配置</h1>
      <p className="page-subtitle">管理客户端版本、渠道与灰度</p>
      <div className="toolbar">
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加版本
        </Button>
        <Select
          value={platformFilter}
          onChange={setPlatformFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: '全部平台' },
            { value: 'ios', label: 'iOS' },
            { value: 'android', label: 'Android' },
            { value: 'web', label: 'Web / 桌面' },
            { value: 'openclaw-plugin', label: 'OpenClaw' },
          ]}
        />
        <Select
          value={forceFilter}
          onChange={setForceFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: '全部更新' },
            { value: 'yes', label: '强制更新' },
            { value: 'no', label: '非强制' },
          ]}
        />
        <div className="toolbar-spacer" />
        <Button icon={<ReloadOutlined />} onClick={fetchData}>
          刷新
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{
          current: page,
          total,
          pageSize: 20,
          pageSizeOptions: [20, 50, 100],
          showSizeChanger: true,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条`,
        }}
      />

      <Modal
        title={editingId ? '编辑版本' : '添加版本'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="os" label="平台" rules={[{ required: true }]}>
            <Select options={osOptions} />
          </Form.Item>
          <Form.Item name="app_version" label="版本号" rules={[{ required: true }]}>
            <Input placeholder="1.0.0" />
          </Form.Item>
          <Form.Item name="download_url" label="下载地址" rules={[{ required: true }]}>
            <Input placeholder="https://example.com/app.apk" />
          </Form.Item>
          <Form.Item name="update_desc" label="更新说明">
            <Input.TextArea rows={3} placeholder="本次更新内容..." />
          </Form.Item>
          <Form.Item name="is_force" label="强制更新" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
