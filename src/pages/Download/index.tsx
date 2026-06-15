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
import { useTranslation } from 'react-i18next'
import api from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'

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
  const { t } = useTranslation(['download', 'common'])
  const canWrite = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'appversion.write'),
  )
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
    if (!canWrite) return
    setEditingId(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: AppVersion) => {
    if (!canWrite) return
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
    if (!canWrite) return
    const values = await form.validateFields()
    const payload = {
      ...values,
      is_force: values.is_force ? 1 : 0,
    }
    try {
      if (editingId) {
        await api.put(`/v1/manager/download/versions/${editingId}`, payload)
        message.success(t('toast.updateSuccess'))
      } else {
        await api.post('/v1/common/appversion', payload)
        message.success(t('toast.addSuccess'))
      }
      setModalVisible(false)
      fetchData()
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const baseColumns: ColumnsType<AppVersion> = [
    {
      title: t('column.appVersion'),
      dataIndex: 'app_version',
      key: 'app_version',
      width: 140,
      render: (v) => <span className="cell-primary mono">{v}</span>,
    },
    {
      title: t('column.platform'),
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
      title: t('column.isForce'),
      dataIndex: 'is_force',
      key: 'is_force',
      width: 100,
      align: 'center',
      render: (v) =>
        v === 1 ? (
          <span className="pill-outline danger">{t('tag.force')}</span>
        ) : (
          <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>
        ),
    },
    {
      title: t('column.updateDesc'),
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
      title: t('column.downloadUrl'),
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
      title: t('column.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value) => <span style={{ color: 'var(--a-text-tertiary)' }}>{value}</span>,
    },
  ]

  const columns: ColumnsType<AppVersion> = canWrite
    ? [
        ...baseColumns,
        {
          title: t('column.action'),
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
                {t('action.edit')}
              </Button>
            </div>
          ),
        },
      ]
    : baseColumns

  return (
    <div>
      <h1 className="page-title">{t('title')}</h1>
      <p className="page-subtitle">{t('subtitle')}</p>
      <div className="toolbar">
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('action.addVersion')}
          </Button>
        )}
        <Select
          value={platformFilter}
          onChange={setPlatformFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: t('filter.platform.all') },
            { value: 'ios', label: 'iOS' },
            { value: 'android', label: 'Android' },
            { value: 'web', label: t('filter.platform.webDesktop') },
            { value: 'openclaw-plugin', label: 'OpenClaw' },
          ]}
        />
        <Select
          value={forceFilter}
          onChange={setForceFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: t('filter.force.all') },
            { value: 'yes', label: t('filter.force.yes') },
            { value: 'no', label: t('filter.force.no') },
          ]}
        />
        <div className="toolbar-spacer" />
        <Button icon={<ReloadOutlined />} onClick={fetchData}>
          {t('common:action.refresh')}
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
          showTotal: (count) => t('common:table.total', { count }),
        }}
      />

      <Modal
        title={editingId ? t('modal.editTitle') : t('modal.addTitle')}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText={t('modal.okText')}
        cancelText={t('modal.cancelText')}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="os" label={t('form.platform')} rules={[{ required: true }]}>
            <Select options={osOptions} />
          </Form.Item>
          <Form.Item name="app_version" label={t('form.appVersion')} rules={[{ required: true }]}>
            <Input placeholder="1.0.0" />
          </Form.Item>
          <Form.Item name="download_url" label={t('form.downloadUrl')} rules={[{ required: true }]}>
            <Input placeholder={t('form.downloadUrlPlaceholder')} />
          </Form.Item>
          <Form.Item name="update_desc" label={t('form.updateDesc')}>
            <Input.TextArea rows={3} placeholder={t('form.updateDescPlaceholder')} />
          </Form.Item>
          <Form.Item name="is_force" label={t('form.isForce')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
