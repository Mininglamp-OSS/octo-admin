import { useEffect, useMemo, useState } from 'react'
import { Table, Input, Button, Select, Tooltip, Typography, message, Modal, Form } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import api from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'

const { Text } = Typography

interface Group {
  group_no: string
  name: string
  creator: string
  create_name: string
  member_count: number
  status: number
  forbidden: number
}

interface RemoveMemberModal {
  open: boolean
  groupNo: string
  groupName: string
}

export default function Groups() {
  const { t } = useTranslation(['groups', 'common'])
  const canWrite = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'groups.write'),
  )
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Group[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'normal' | 'banned' | 'forbidden'>('all')
  const [removeModal, setRemoveModal] = useState<RemoveMemberModal>({ open: false, groupNo: '', groupName: '' })
  const [removeLoading, setRemoveLoading] = useState(false)
  const [form] = Form.useForm()

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page_index: page.toString(),
        page_size: '20',
      })
      if (keyword) params.append('keyword', keyword)
      const res = await api.get(`/v1/manager/group/list?${params}`)
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

  const handleSearch = () => {
    setPage(1)
    fetchData()
  }

  const filteredData = useMemo(() => {
    return data.filter((g) => {
      if (statusFilter === 'normal' && !(g.status === 1 && g.forbidden !== 1)) return false
      if (statusFilter === 'banned' && g.status !== 0) return false
      if (statusFilter === 'forbidden' && g.forbidden !== 1) return false
      return true
    })
  }, [data, statusFilter])

  const handleBan = async (groupNo: string, status: number) => {
    if (!canWrite) return
    Modal.confirm({
      title: status === 0 ? t('confirm.ban') : t('confirm.unban'),
      onOk: async () => {
        await api.put(`/v1/manager/group/liftban/${groupNo}/${status}`)
        message.success(status === 0 ? t('toast.banned') : t('toast.unbanned'))
        fetchData()
      },
    })
  }

  const handleForbid = async (groupNo: string, on: number) => {
    if (!canWrite) return
    await api.put(`/v1/manager/groups/${groupNo}/forbidden/${on}`)
    message.success(on === 1 ? t('toast.forbidden') : t('toast.unforbidden'))
    fetchData()
  }

  const openRemoveModal = (group: Group) => {
    if (!canWrite) return
    form.resetFields()
    setRemoveModal({ open: true, groupNo: group.group_no, groupName: group.name })
  }

  const handleRemoveMember = async () => {
    if (!canWrite) return
    const { uid } = await form.validateFields()
    const uids = (uid as string).split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
    if (uids.length === 0) return
    setRemoveLoading(true)
    try {
      await api.delete(`/v1/manager/groups/${removeModal.groupNo}/members`, { data: { uid: uids } })
      message.success(t('remove.success', { count: uids.length }))
      setRemoveModal({ open: false, groupNo: '', groupName: '' })
      fetchData()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setRemoveLoading(false)
    }
  }

  const baseColumns: ColumnsType<Group> = [
    {
      title: t('column.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name) => <span className="cell-primary">{name}</span>,
    },
    {
      title: t('column.groupNo'),
      dataIndex: 'group_no',
      key: 'group_no',
      width: 220,
      render: (no) => (
        <Tooltip title={no} mouseEnterDelay={0.2}>
          <Text
            copyable={{ text: no }}
            style={{ maxWidth: 200, color: 'var(--a-text-tertiary)' }}
            className="mono"
            ellipsis
          >
            {no}
          </Text>
        </Tooltip>
      ),
    },
    { title: t('column.creator'), dataIndex: 'create_name', key: 'create_name', width: 140 },
    {
      title: t('column.memberCount'),
      dataIndex: 'member_count',
      key: 'member_count',
      width: 100,
      render: (n) => <span className="cell-primary">{n}</span>,
    },
    {
      title: t('column.status'),
      key: 'status',
      width: 160,
      render: (_, record) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {record.status === 1 ? (
            <span className="pill-dot online">{t('status.normal')}</span>
          ) : (
            <span className="pill-dot banned">{t('status.banned')}</span>
          )}
          {record.forbidden === 1 && <span className="pill-dot warning">{t('tag.forbidden')}</span>}
        </span>
      ),
    },
  ]

  const columns: ColumnsType<Group> = canWrite
    ? [
        ...baseColumns,
        {
          title: t('column.action'),
          key: 'action',
          width: 240,
          align: 'right',
          render: (_, record) => (
            <div className="row-actions" style={{ display: 'inline-flex', gap: 4 }}>
              {record.status === 1 ? (
                <Button size="small" danger onClick={() => handleBan(record.group_no, 0)}>{t('action.ban')}</Button>
              ) : (
                <Button size="small" type="primary" ghost onClick={() => handleBan(record.group_no, 1)}>{t('action.unban')}</Button>
              )}
              {record.forbidden !== 1 ? (
                <Button size="small" className="btn-mute" onClick={() => handleForbid(record.group_no, 1)}>{t('action.forbid')}</Button>
              ) : (
                <Button size="small" type="primary" ghost onClick={() => handleForbid(record.group_no, 0)}>{t('action.unforbid')}</Button>
              )}
              <Button size="small" danger onClick={() => openRemoveModal(record)}>{t('action.removeMember')}</Button>
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
        <Input
          placeholder={t('search.placeholder')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 280 }}
          allowClear
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: t('status.all') },
            { value: 'normal', label: t('status.normal') },
            { value: 'banned', label: t('status.banned') },
            { value: 'forbidden', label: t('status.forbidden') },
          ]}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          {t('common:action.search')}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>
          {t('common:action.refresh')}
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="group_no"
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
        title={t('remove.title', { name: removeModal.groupName })}
        open={removeModal.open}
        onOk={handleRemoveMember}
        onCancel={() => setRemoveModal({ open: false, groupNo: '', groupName: '' })}
        confirmLoading={removeLoading}
        okText={t('remove.ok')}
        okButtonProps={{ danger: true }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="uid"
            label={t('remove.field.label')}
            rules={[{ required: true, message: t('remove.field.required') }]}
            extra={t('remove.field.extra')}
          >
            <Input.TextArea rows={3} placeholder={t('remove.field.placeholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
