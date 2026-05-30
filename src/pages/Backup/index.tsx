import { useEffect, useState } from 'react'
import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Table,
  Tag,
  Space,
  message,
  Popconfirm,
  Row,
  Col,
  Divider,
  Tooltip,
  Descriptions,
} from 'antd'
import {
  ReloadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import {
  BackupHistory,
  getBackupConfig,
  updateBackupConfig,
  testBackupConnection,
  triggerBackup,
  getBackupHistory,
  deleteBackupHistory,
  getBackupDownloadURL,
  getBackupStatus,
} from '../../api/backup'

export default function Backup() {
  const { t } = useTranslation(['backup', 'common'])
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory] = useState<BackupHistory[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [status, setStatus] = useState<{ is_running: boolean; next_run: string } | null>(null)
  const [cosConfig, setCosConfig] = useState<{ storage_type: string; bucket: string; region: string } | null>(null)

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const config = await getBackupConfig()
      form.setFieldsValue(config)
      // 保存只读的系统 COS 配置
      setCosConfig({
        storage_type: config.storage_type,
        bucket: config.bucket,
        region: config.region,
      })
    } catch (error) {
      message.error(t('toast.fetchConfigFailed', { message: (error as Error).message }))
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    setHistoryLoading(true)
    try {
      const data = await getBackupHistory(historyPage, 10)
      setHistory(data.list || [])
      setHistoryTotal(data.count || 0)
    } catch (error) {
      message.error(t('toast.fetchHistoryFailed', { message: (error as Error).message }))
    } finally {
      setHistoryLoading(false)
    }
  }

  const fetchStatus = async () => {
    try {
      const data = await getBackupStatus()
      setStatus(data)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchConfig()
    fetchHistory()
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [historyPage])

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await updateBackupConfig(values)
      message.success(t('toast.configSaved'))
    } catch (error) {
      message.error(t('toast.saveFailed', { message: (error as Error).message }))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      await testBackupConnection()
      message.success(t('toast.testSuccess'))
    } catch (error) {
      message.error(t('toast.testFailed', { message: (error as Error).message }))
    } finally {
      setTesting(false)
    }
  }

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      const data = await triggerBackup()
      message.success(data.message || t('toast.backupStarted'))
      fetchStatus()
      setTimeout(fetchHistory, 2000)
    } catch (error) {
      message.error(t('toast.triggerFailed', { message: (error as Error).message }))
    } finally {
      setTriggering(false)
    }
  }

  const handleDownload = async (id: number) => {
    try {
      const data = await getBackupDownloadURL(id)
      window.open(data.url, '_blank')
    } catch (error) {
      message.error(t('toast.downloadFailed', { message: (error as Error).message }))
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteBackupHistory(id)
      message.success(t('toast.deleted'))
      fetchHistory()
    } catch (error) {
      message.error(t('toast.deleteFailed', { message: (error as Error).message }))
    }
  }

  const statusIcon = (s: string) => {
    switch (s) {
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'running':
        return <LoadingOutlined style={{ color: '#1890ff' }} />
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#f5222d' }} />
      default:
        return <ClockCircleOutlined style={{ color: '#faad14' }} />
    }
  }

  const statusTag = (s: string) => {
    const map: Record<string, { color: string; text: string }> = {
      success: { color: 'success', text: t('tag.success') },
      running: { color: 'processing', text: t('tag.running') },
      failed: { color: 'error', text: t('tag.failed') },
      pending: { color: 'warning', text: t('tag.pending') },
    }
    const item = map[s] || { color: 'default', text: s }
    return <Tag color={item.color}>{item.text}</Tag>
  }

  const columns: ColumnsType<BackupHistory> = [
    {
      title: t('column.status'),
      key: 'status',
      width: 90,
      render: (_, record) => (
        <Space>
          {statusIcon(record.status)}
          {statusTag(record.status)}
        </Space>
      ),
    },
    { title: t('column.fileName'), dataIndex: 'file_name', key: 'file_name', ellipsis: true },
    { title: t('column.size'), dataIndex: 'file_size_str', key: 'file_size_str', width: 90 },
    { title: t('column.startedAt'), dataIndex: 'started_at', key: 'started_at', width: 150 },
    { title: t('column.finishedAt'), dataIndex: 'finished_at', key: 'finished_at', width: 150 },
    {
      title: t('column.errorMessage'),
      dataIndex: 'error_message',
      key: 'error_message',
      width: 150,
      ellipsis: true,
      render: (text) => text && <Tooltip title={text}><span style={{ color: '#f5222d' }}>{text}</span></Tooltip>,
    },
    {
      title: t('column.action'),
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space size="small">
          {record.status === 'success' && (
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(record.id)}
            />
          )}
          <Popconfirm title={t('confirm.delete')} onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">{t('title')}</h1>
      <p className="page-subtitle">{t('subtitle')}</p>

      <Row gutter={24}>
        <Col span={12}>
          <Card
            title={t('card.config')}
            loading={loading}
            extra={
              <Space>
                <Button onClick={handleTest} loading={testing}>
                  {t('action.testConnection')}
                </Button>
                <Button type="primary" onClick={handleSave} loading={saving}>
                  {t('action.saveConfig')}
                </Button>
              </Space>
            }
          >
            {/* 系统 COS 配置（只读） */}
            <Descriptions title={t('storage.title')} size="small" column={1} style={{ marginBottom: 24 }}>
              <Descriptions.Item label={t('storage.type')}>{cosConfig?.storage_type?.toUpperCase() || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('storage.bucket')}>{cosConfig?.bucket || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('storage.region')}>{cosConfig?.region || '-'}</Descriptions.Item>
            </Descriptions>

            <Divider />

            <Form form={form} layout="vertical">
              <Form.Item name="enabled" label={t('form.enabled')} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="prefix" label={t('form.prefix')} rules={[{ required: true }]}>
                <Input placeholder="backup/" />
              </Form.Item>
              <Form.Item name="cron_expr" label={t('form.cronExpr')} rules={[{ required: true }]} extra={t('form.cronExpr.extra')}>
                <Input placeholder="0 2 * * *" />
              </Form.Item>
              <Form.Item name="retention_count" label={t('form.retentionCount')} rules={[{ required: true }]}>
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="data_dir" label={t('form.dataDir')} rules={[{ required: true }]}>
                <Input placeholder="/data/octo" />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={12}>
          <Card
            title={t('card.status')}
            extra={
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleTrigger}
                loading={triggering || status?.is_running}
                disabled={status?.is_running}
              >
                {status?.is_running ? t('action.backingUp') : t('action.backupNow')}
              </Button>
            }
          >
            <p>
              <strong>{t('status.label')}</strong>
              {status?.is_running ? (
                <Tag color="processing" icon={<LoadingOutlined />}>
                  {t('status.backingUp')}
                </Tag>
              ) : (
                <Tag color="success">{t('status.idle')}</Tag>
              )}
            </p>
            {status?.next_run && (
              <p>
                <strong>{t('status.nextRun')}</strong>
                {status.next_run}
              </p>
            )}
          </Card>
        </Col>
      </Row>

      <Divider />

      <Card
        title={t('card.history')}
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchHistory}>
            {t('common:action.refresh')}
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={history}
          rowKey="id"
          loading={historyLoading}
          pagination={{
            current: historyPage,
            total: historyTotal,
            pageSize: 10,
            onChange: setHistoryPage,
            showTotal: (count) => t('common:table.total', { count }),
          }}
        />
      </Card>
    </div>
  )
}
