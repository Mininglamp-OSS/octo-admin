import { useEffect, useMemo, useRef, useState } from 'react'
import { Table, Input, Button, Select, message, Modal, Tooltip, Typography } from 'antd'
import { SearchOutlined, ReloadOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../api'

const { Text } = Typography

interface User {
  uid: string
  name: string
  username: string
  phone?: string | null
  email?: string | null
  status: number
  online: number
  is_destroy: number
  is_bot?: number
  is_system?: number
  register_time: string
}

type TypeFilter = 'all' | 'human' | 'bot' | 'system'
type StatusFilter = 'all' | 'online' | 'offline' | 'banned' | 'destroyed'

export default function Users() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  // 序号守卫：快速切换筛选/分页时，仅采用最近一次请求的响应，避免错序覆盖
  const fetchSeq = useRef(0)

  const fetchData = async (
    nextPage = page,
    nextPageSize = pageSize,
    nextType = typeFilter,
    kw = keyword,
  ) => {
    const seq = ++fetchSeq.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page_index: nextPage.toString(),
        page_size: nextPageSize.toString(),
      })
      if (kw) params.append('keyword', kw)
      // 类型筛选全部下推到后端，分页基于过滤后结果
      if (nextType === 'human') {
        params.append('exclude_bot', '1')
        params.append('exclude_system', '1')
      } else if (nextType === 'bot') {
        params.append('bot_only', '1')
      } else if (nextType === 'system') {
        params.append('system_only', '1')
      }
      const res = await api.get(`/v1/manager/user/list?${params}`)
      if (seq !== fetchSeq.current) return
      setData(res.data.list || [])
      setTotal(res.data.count || 0)
    } catch (error) {
      if (seq === fetchSeq.current) {
        message.error((error as Error).message)
      }
    } finally {
      if (seq === fetchSeq.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchData(page, pageSize, typeFilter, keyword)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, typeFilter])

  // 类型筛选已下推到后端；状态筛选仍是当前页客户端过滤（后端尚未支持）
  const filteredData = useMemo(() => {
    return data.filter((u) => {
      if (statusFilter === 'destroyed' && u.is_destroy !== 1) return false
      if (statusFilter === 'banned' && u.status !== 0) return false
      if (statusFilter === 'online' && !(u.online === 1 && u.status === 1 && u.is_destroy !== 1)) return false
      if (statusFilter === 'offline' && !(u.online !== 1 && u.status === 1 && u.is_destroy !== 1)) return false
      return true
    })
  }, [data, statusFilter])

  const handleSearch = () => {
    if (page !== 1) {
      setPage(1)
    } else {
      fetchData(1, pageSize, typeFilter, keyword)
    }
  }

  const handleTypeFilterChange = (v: TypeFilter) => {
    setTypeFilter(v)
    if (page !== 1) setPage(1)
  }

  const handleBan = async (uid: string, status: number) => {
    Modal.confirm({
      title: status === 0 ? '确认封禁用户？' : '确认解封用户？',
      onOk: async () => {
        await api.put(`/v1/manager/user/liftban/${uid}/${status}`)
        message.success(status === 0 ? '已封禁' : '已解封')
        fetchData(page, pageSize, typeFilter, keyword)
      },
    })
  }

  const columns: ColumnsType<User> = [
    {
      title: '用户名',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name, record) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="cell-primary">{name}</span>
          {record.is_system === 1 ? (
            <span className="ai-tag" aria-label="系统账号">
              <SettingOutlined /> 系统
            </span>
          ) : record.is_bot === 1 ? (
            <span className="ai-tag" aria-label="Bot 账号">
              <RobotOutlined /> BOT
            </span>
          ) : null}
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
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (v) => <span style={{ color: 'var(--a-text-tertiary)' }}>{v || '-'}</span>,
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 140,
      render: (v) => <span style={{ color: 'var(--a-text-tertiary)' }}>{v || '-'}</span>,
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
          placeholder="搜索 UID/手机号/用户名/Email"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 280 }}
          allowClear
        />
        <Select
          value={typeFilter}
          onChange={handleTypeFilterChange}
          style={{ width: 130 }}
          options={[
            { value: 'all', label: '全部类型' },
            { value: 'human', label: '真实用户' },
            { value: 'bot', label: 'Bot 账号' },
            { value: 'system', label: '系统账号' },
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
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
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
