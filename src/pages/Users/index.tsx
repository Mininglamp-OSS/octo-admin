// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Octo Contributors

import { useEffect, useMemo, useState } from 'react'
import { Table, Input, Button, Select, message, Modal, Tooltip, Typography } from 'antd'
import { SearchOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../api'

const { Text } = Typography

interface User {
  uid: string
  name: string
  username: string
  phone: string
  status: number
  online: number
  is_destroy: number
  register_time: string
}

export default function Users() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [typeFilter, setTypeFilter] = useState<'all' | 'human' | 'bot'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'banned' | 'destroyed'>('all')

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page_index: page.toString(),
        page_size: pageSize.toString(),
      })
      if (keyword) params.append('keyword', keyword)
      const res = await api.get(`/v1/manager/user/list?${params}`)
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
  }, [page, pageSize])

  const filteredData = useMemo(() => {
    return data.filter((u) => {
      if (typeFilter === 'bot' && !u.uid?.endsWith('_bot')) return false
      if (typeFilter === 'human' && u.uid?.endsWith('_bot')) return false
      if (statusFilter === 'destroyed' && u.is_destroy !== 1) return false
      if (statusFilter === 'banned' && u.status !== 0) return false
      if (statusFilter === 'online' && !(u.online === 1 && u.status === 1 && u.is_destroy !== 1)) return false
      if (statusFilter === 'offline' && !(u.online !== 1 && u.status === 1 && u.is_destroy !== 1)) return false
      return true
    })
  }, [data, typeFilter, statusFilter])

  const handleSearch = () => {
    setPage(1)
    fetchData()
  }

  const handleBan = async (uid: string, status: number) => {
    Modal.confirm({
      title: status === 0 ? '确认封禁用户？' : '确认解封用户？',
      onOk: async () => {
        await api.put(`/v1/manager/user/liftban/${uid}/${status}`)
        message.success(status === 0 ? '已封禁' : '已解封')
        fetchData()
      },
    })
  }

  const isBot = (uid: string) => uid?.endsWith('_bot')

  const columns: ColumnsType<User> = [
    {
      title: '用户名',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name, record) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="cell-primary">{name}</span>
          {isBot(record.uid) && typeFilter !== 'bot' && (
            <span className="ai-tag" aria-label="Bot 账号">
              <RobotOutlined /> BOT
            </span>
          )}
        </span>
      ),
    },
    {
      title: 'UID',
      dataIndex: 'uid',
      key: 'uid',
      width: 220,
      render: (uid) => (
        <Tooltip title={uid} mouseEnterDelay={0.2}>
          <Text
            copyable={{ text: uid }}
            style={{ maxWidth: 200, color: 'var(--a-text-tertiary)' }}
            className="mono"
            ellipsis
          >
            {uid}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, record) => {
        if (record.is_destroy === 1) return <span className="pill-dot destroyed">已注销</span>
        if (record.status === 0) return <span className="pill-dot banned">封禁</span>
        return record.online === 1 ? (
          <span className="pill-dot online">在线</span>
        ) : (
          <span className="pill-dot offline">离线</span>
        )
      },
    },
    {
      title: '注册时间',
      dataIndex: 'register_time',
      key: 'register_time',
      width: 170,
      render: (t) => <span style={{ color: 'var(--a-text-tertiary)' }}>{t}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'right',
      render: (_, record) => (
        <div className="row-actions" style={{ display: 'inline-flex', gap: 4 }}>
          {record.status === 1 && record.is_destroy !== 1 && (
            <Button size="small" danger onClick={() => handleBan(record.uid, 0)}>封禁</Button>
          )}
          {record.status === 0 && record.is_destroy !== 1 && (
            <Button size="small" type="primary" ghost onClick={() => handleBan(record.uid, 1)}>解封</Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">用户管理</h1>
      <p className="page-subtitle">管理真人与 AI 账号、处理封禁/解封流程</p>
      <div className="toolbar">
        <Input
          placeholder="搜索 UID/手机号/用户名"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 280 }}
          allowClear
        />
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: '全部类型' },
            { value: 'human', label: '真实用户' },
            { value: 'bot', label: 'Bot 账号' },
          ]}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'online', label: '在线' },
            { value: 'offline', label: '离线' },
            { value: 'banned', label: '封禁' },
            { value: 'destroyed', label: '已注销' },
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
        rowKey="uid"
        loading={loading}
        size="middle"
        pagination={{
          current: page,
          total,
          pageSize,
          pageSizeOptions: [20, 50, 100],
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p)
            if (ps !== pageSize) setPageSize(ps)
          },
          showTotal: (t) => `共 ${t} 条`,
        }}
      />
    </div>
  )
}
