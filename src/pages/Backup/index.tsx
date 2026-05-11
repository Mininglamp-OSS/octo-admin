// Copyright 2026 MININGLAMP Technology and the OCTO contributors
// SPDX-License-Identifier: Apache-2.0

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
      message.error('获取配置失败: ' + (error as Error).message)
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
      message.error('获取备份历史失败: ' + (error as Error).message)
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
      message.success('配置已保存')
    } catch (error) {
      message.error('保存失败: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      await testBackupConnection()
      message.success('连接测试成功')
    } catch (error) {
      message.error('连接测试失败: ' + (error as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      const data = await triggerBackup()
      message.success(data.message || '备份已开始')
      fetchStatus()
      setTimeout(fetchHistory, 2000)
    } catch (error) {
      message.error('触发备份失败: ' + (error as Error).message)
    } finally {
      setTriggering(false)
    }
  }

  const handleDownload = async (id: number) => {
    try {
      const data = await getBackupDownloadURL(id)
      window.open(data.url, '_blank')
    } catch (error) {
      message.error('获取下载链接失败: ' + (error as Error).message)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteBackupHistory(id)
      message.success('已删除')
      fetchHistory()
    } catch (error) {
      message.error('删除失败: ' + (error as Error).message)
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
      success: { color: 'success', text: '成功' },
      running: { color: 'processing', text: '运行中' },
      failed: { color: 'error', text: '失败' },
      pending: { color: 'warning', text: '等待中' },
    }
    const item = map[s] || { color: 'default', text: s }
    return <Tag color={item.color}>{item.text}</Tag>
  }

  const columns: ColumnsType<BackupHistory> = [
    {
      title: '状态',
      key: 'status',
      width: 90,
      render: (_, record) => (
        <Space>
          {statusIcon(record.status)}
          {statusTag(record.status)}
        </Space>
      ),
    },
    { title: '文件名', dataIndex: 'file_name', key: 'file_name', ellipsis: true },
    { title: '大小', dataIndex: 'file_size_str', key: 'file_size_str', width: 90 },
    { title: '开始时间', dataIndex: 'started_at', key: 'started_at', width: 150 },
    { title: '完成时间', dataIndex: 'finished_at', key: 'finished_at', width: 150 },
    {
      title: '错误信息',
      dataIndex: 'error_message',
      key: 'error_message',
      width: 150,
      ellipsis: true,
      render: (text) => text && <Tooltip title={text}><span style={{ color: '#f5222d' }}>{text}</span></Tooltip>,
    },
    {
      title: '操作',
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
          <Popconfirm title="确定删除此备份？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">备份管理</h1>
      <p className="page-subtitle">备份策略配置、测试与恢复</p>

      <Row gutter={24}>
        <Col span={12}>
          <Card
            title="备份配置"
            loading={loading}
            extra={
              <Space>
                <Button onClick={handleTest} loading={testing}>
                  测试连接
                </Button>
                <Button type="primary" onClick={handleSave} loading={saving}>
                  保存配置
                </Button>
              </Space>
            }
          >
            {/* 系统 COS 配置（只读） */}
            <Descriptions title="存储配置（系统 COS）" size="small" column={1} style={{ marginBottom: 24 }}>
              <Descriptions.Item label="存储类型">{cosConfig?.storage_type?.toUpperCase() || '-'}</Descriptions.Item>
              <Descriptions.Item label="Bucket">{cosConfig?.bucket || '-'}</Descriptions.Item>
              <Descriptions.Item label="Region">{cosConfig?.region || '-'}</Descriptions.Item>
            </Descriptions>

            <Divider />

            <Form form={form} layout="vertical">
              <Form.Item name="enabled" label="启用备份" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="prefix" label="备份路径前缀" rules={[{ required: true }]}>
                <Input placeholder="backup/" />
              </Form.Item>
              <Form.Item name="cron_expr" label="定时表达式" rules={[{ required: true }]} extra="示例: 0 2 * * * (每天凌晨2点)">
                <Input placeholder="0 2 * * *" />
              </Form.Item>
              <Form.Item name="retention_count" label="保留数量" rules={[{ required: true }]}>
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="data_dir" label="数据目录" rules={[{ required: true }]}>
                <Input placeholder="/data/octo" />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={12}>
          <Card
            title="备份状态"
            extra={
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleTrigger}
                loading={triggering || status?.is_running}
                disabled={status?.is_running}
              >
                {status?.is_running ? '备份中...' : '立即备份'}
              </Button>
            }
          >
            <p>
              <strong>当前状态：</strong>
              {status?.is_running ? (
                <Tag color="processing" icon={<LoadingOutlined />}>
                  正在备份
                </Tag>
              ) : (
                <Tag color="success">空闲</Tag>
              )}
            </p>
            {status?.next_run && (
              <p>
                <strong>下次备份：</strong>
                {status.next_run}
              </p>
            )}
          </Card>
        </Col>
      </Row>

      <Divider />

      <Card
        title="备份历史"
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchHistory}>
            刷新
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
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </Card>
    </div>
  )
}
