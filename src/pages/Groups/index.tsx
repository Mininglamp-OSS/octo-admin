// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Octo Contributors

import { useEffect, useMemo, useState } from 'react'
import { Table, Input, Button, Select, Tooltip, Typography, message, Modal, Form } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../api'

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
    Modal.confirm({
      title: status === 0 ? '确认封禁群组？' : '确认解封群组？',
      onOk: async () => {
        await api.put(`/v1/manager/group/liftban/${groupNo}/${status}`)
        message.success(status === 0 ? '已封禁' : '已解封')
        fetchData()
      },
    })
  }

  const handleForbid = async (groupNo: string, on: number) => {
    await api.put(`/v1/manager/groups/${groupNo}/forbidden/${on}`)
    message.success(on === 1 ? '已开启禁言' : '已解除禁言')
    fetchData()
  }

  const openRemoveModal = (group: Group) => {
    form.resetFields()
    setRemoveModal({ open: true, groupNo: group.group_no, groupName: group.name })
  }

  const handleRemoveMember = async () => {
    const { uid } = await form.validateFields()
    const uids = (uid as string).split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
    if (uids.length === 0) return
    setRemoveLoading(true)
    try {
      await api.delete(`/v1/manager/groups/${removeModal.groupNo}/members`, { data: { uid: uids } })
      message.success(`已移除 ${uids.length} 个成员`)
      setRemoveModal({ open: false, groupNo: '', groupName: '' })
      fetchData()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setRemoveLoading(false)
    }
  }

  const columns: ColumnsType<Group> = [
    {
      title: '群名称',
      dataIndex: 'name',
      key: 'name',
      render: (name) => <span className="cell-primary">{name}</span>,
    },
    {
      title: '群编号',
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
    { title: '创建者', dataIndex: 'create_name', key: 'create_name', width: 140 },
    {
      title: '成员数',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 100,
      render: (n) => <span className="cell-primary">{n}</span>,
    },
    {
      title: '状态',
      key: 'status',
      width: 160,
      render: (_, record) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {record.status === 1 ? (
            <span className="pill-dot online">正常</span>
          ) : (
            <span className="pill-dot banned">封禁</span>
          )}
          {record.forbidden === 1 && <span className="pill-dot warning">禁言</span>}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      align: 'right',
      render: (_, record) => (
        <div className="row-actions" style={{ display: 'inline-flex', gap: 4 }}>
          {record.status === 1 ? (
            <Button size="small" danger onClick={() => handleBan(record.group_no, 0)}>封禁</Button>
          ) : (
            <Button size="small" type="primary" ghost onClick={() => handleBan(record.group_no, 1)}>解封</Button>
          )}
          {record.forbidden !== 1 ? (
            <Button size="small" className="btn-mute" onClick={() => handleForbid(record.group_no, 1)}>禁言</Button>
          ) : (
            <Button size="small" type="primary" ghost onClick={() => handleForbid(record.group_no, 0)}>解除禁言</Button>
          )}
          <Button size="small" danger onClick={() => openRemoveModal(record)}>移除成员</Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">群组管理</h1>
      <p className="page-subtitle">管理群组状态、禁言与成员移除</p>
      <div className="toolbar">
        <Input
          placeholder="搜索群名称/群编号"
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
            { value: 'all', label: '全部状态' },
            { value: 'normal', label: '正常' },
            { value: 'banned', label: '封禁' },
            { value: 'forbidden', label: '禁言中' },
          ]}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          搜索
        </Button>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>
          刷新
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
          showTotal: (t) => `共 ${t} 条`,
        }}
      />

      <Modal
        title={`移除成员 — ${removeModal.groupName}`}
        open={removeModal.open}
        onOk={handleRemoveMember}
        onCancel={() => setRemoveModal({ open: false, groupNo: '', groupName: '' })}
        confirmLoading={removeLoading}
        okText="确认移除"
        okButtonProps={{ danger: true }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="uid"
            label="用户 UID"
            rules={[{ required: true, message: '请输入要移除的 UID' }]}
            extra="多个 UID 用逗号或空格分隔"
          >
            <Input.TextArea rows={3} placeholder="例如：uid1, uid2, uid3" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
