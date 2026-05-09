import { useEffect, useRef, useState } from 'react'
import {
  Table,
  Input,
  Button,
  Tabs,
  Tooltip,
  Typography,
  Modal,
  Form,
  InputNumber,
  Radio,
  Select,
  Spin,
  message,
} from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../api'
import {
  createSpace,
  dissolveSpace,
  listDisabledSpaces,
  listSpaces,
  updateSpaceStatus,
  type Space as SpaceItem,
  type SpaceJoinMode,
  type SpaceStatus,
} from '../../api/space'
import SpaceDetailDrawer from './SpaceDetailDrawer'

interface UserOptionRaw {
  uid: string
  name: string
  username?: string
  email?: string
  phone?: string
  status?: number
  is_destroy?: number
}

const { Text } = Typography

type TabKey = 'active' | 'disabled'

const PAGE_SIZE = 20

const STATUS_META: Record<SpaceStatus, { text: string; tone: 'online' | 'destroyed' | 'banned' }> = {
  0: { text: '已解散', tone: 'destroyed' },
  1: { text: '正常', tone: 'online' },
  2: { text: '已封禁', tone: 'banned' },
}

export default function Spaces() {
  const [tab, setTab] = useState<TabKey>('active')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<SpaceItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [drawer, setDrawer] = useState<{
    open: boolean
    spaceId: string | null
    tab: 'members' | 'invites' | 'join-applies'
  }>({
    open: false,
    spaceId: null,
    tab: 'members',
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createForm] = Form.useForm<{
    creator_uid: string
    name: string
    description?: string
    logo?: string
    join_mode: SpaceJoinMode
    max_users?: number
    preset_group_ids?: string
  }>()
  const [userOptions, setUserOptions] = useState<UserOptionRaw[]>([])
  const [userSearching, setUserSearching] = useState(false)
  const userSearchSeq = useRef(0)

  const searchUsers = async (kw: string) => {
    const seq = ++userSearchSeq.current
    setUserSearching(true)
    try {
      const params = new URLSearchParams({ page_index: '1', page_size: '20' })
      if (kw) params.append('keyword', kw)
      const res = await api.get<{ list: UserOptionRaw[] }>(
        `/v1/manager/user/list?${params}`,
      )
      if (seq === userSearchSeq.current) {
        const list = (res.data.list || []).filter(
          (u) => u.status === 1 && u.is_destroy !== 1 && !u.uid?.endsWith('_bot'),
        )
        setUserOptions(list)
      }
    } catch (error) {
      if (seq === userSearchSeq.current) {
        message.error((error as Error).message)
      }
    } finally {
      if (seq === userSearchSeq.current) {
        setUserSearching(false)
      }
    }
  }

  const fetchData = async (nextTab = tab, nextPage = page, kw = keyword) => {
    setLoading(true)
    try {
      const fetcher = nextTab === 'active' ? listSpaces : listDisabledSpaces
      const res = await fetcher({
        keyword: kw || undefined,
        page_index: nextPage,
        page_size: PAGE_SIZE,
      })
      setData(res.list || [])
      setTotal(res.count || 0)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    setKeyword('')
    fetchData(tab, 1, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleSearch = () => {
    setPage(1)
    fetchData(tab, 1, keyword)
  }

  const handleBan = (space: SpaceItem) => {
    Modal.confirm({
      title: `确认封禁空间「${space.name}」？`,
      content: '封禁后该空间将进入封禁列表，可在封禁列表中解禁。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await updateSpaceStatus(space.space_id, 2)
          message.success('已封禁')
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleUnban = (space: SpaceItem) => {
    Modal.confirm({
      title: `确认解禁空间「${space.name}」？`,
      onOk: async () => {
        try {
          await updateSpaceStatus(space.space_id, 1)
          message.success('已解禁')
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleDissolve = (space: SpaceItem) => {
    Modal.confirm({
      title: `确认强制解散「${space.name}」？`,
      content: '该操作不可撤销。所有成员将被置为已移除状态。',
      okButtonProps: { danger: true },
      okText: '强制解散',
      onOk: async () => {
        try {
          await dissolveSpace(space.space_id)
          message.success('已解散')
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const openDetail = (
    spaceId: string,
    tab: 'members' | 'invites' | 'join-applies' = 'members',
  ) => setDrawer({ open: true, spaceId, tab })

  const handleCreate = async () => {
    const values = await createForm.validateFields()
    const preset = values.preset_group_ids?.trim()
    if (preset) {
      try {
        const parsed = JSON.parse(preset)
        if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string')) {
          message.error('预设群组必须是字符串数组 JSON，如 ["g1","g2"]')
          return
        }
      } catch {
        message.error('预设群组 JSON 格式错误')
        return
      }
    }
    setCreateLoading(true)
    try {
      const resp = await createSpace({
        creator_uid: values.creator_uid.trim(),
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        logo: values.logo?.trim() || undefined,
        join_mode: values.join_mode,
        max_users: values.max_users,
        preset_group_ids: preset || undefined,
      })
      message.success(
        resp.invite_code
          ? `创建成功，邀请码：${resp.invite_code}`
          : '创建成功',
      )
      setCreateOpen(false)
      createForm.resetFields()
      if (tab === 'active') {
        setPage(1)
        fetchData('active', 1, keyword)
      } else {
        setTab('active')
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setCreateLoading(false)
    }
  }

  const columns: ColumnsType<SpaceItem> = [
    {
      title: 'Space 名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <a className="cell-primary" onClick={() => openDetail(record.space_id)}>
          {name}
        </a>
      ),
    },
    {
      title: 'Space ID',
      dataIndex: 'space_id',
      key: 'space_id',
      width: 220,
      render: (id) => (
        <Tooltip title={id} mouseEnterDelay={0.2}>
          <Text
            copyable={{ text: id }}
            style={{ maxWidth: 200, color: 'var(--a-text-tertiary)' }}
            className="mono"
            ellipsis
          >
            {id}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '创建者',
      dataIndex: 'creator_name',
      key: 'creator_name',
      width: 180,
      render: (name: string, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
          <span className="cell-primary">{name}</span>
          {record.creator && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--a-text-quaternary)' }}>
              {record.creator.slice(0, 12)}…
            </span>
          )}
        </div>
      ),
    },
    {
      title: '成员数',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 90,
      render: (n) => <span className="cell-primary">{n}</span>,
    },
    {
      title: '加入方式',
      dataIndex: 'join_mode',
      key: 'join_mode',
      width: 110,
      render: (m: number) =>
        m === 0 ? (
          <span className="pill-outline neutral">直接加入</span>
        ) : (
          <span className="pill-outline warning">需审批</span>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: SpaceStatus) => {
        const meta = STATUS_META[status]
        return <span className={`pill-dot ${meta.tone}`}>{meta.text}</span>
      },
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 280,
      align: 'right',
      render: (_, record) => (
        <div className="row-actions" style={{ display: 'inline-flex', gap: 4 }}>
          <Button size="small" className="btn-row-edit" onClick={() => openDetail(record.space_id)}>
            详情
          </Button>
          <Button
            size="small"
            className="btn-row-edit"
            onClick={() => openDetail(record.space_id, 'invites')}
          >
            邀请码
          </Button>
          {record.status === 1 && (
            <>
              <Button size="small" danger onClick={() => handleBan(record)}>
                封禁
              </Button>
              <Button size="small" danger onClick={() => handleDissolve(record)}>
                解散
              </Button>
            </>
          )}
          {record.status === 2 && (
            <Button size="small" type="primary" ghost onClick={() => handleUnban(record)}>
              解禁
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">Space 管理</h1>
      <p className="page-subtitle">查看与管理团队空间：成员、邀请码、加入申请</p>

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as TabKey)}
        items={[
          { key: 'active', label: '活跃空间' },
          { key: 'disabled', label: '已解散 / 已封禁' },
        ]}
      />

      <div className="toolbar">
        <Input
          placeholder="搜索 Space 名称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 280 }}
          allowClear
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          搜索
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
          刷新
        </Button>
        <div className="toolbar-spacer" />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setCreateOpen(true)
            setUserOptions([])
            searchUsers('')
          }}
        >
          创建空间
        </Button>
      </div>

      <Table<SpaceItem>
        columns={columns}
        dataSource={data}
        rowKey="space_id"
        loading={loading}
        size="middle"
        pagination={{
          current: page,
          total,
          pageSize: PAGE_SIZE,
          pageSizeOptions: [20, 50, 100],
          showSizeChanger: false,
          onChange: (p) => {
            setPage(p)
            fetchData(tab, p, keyword)
          },
          showTotal: (t) => `共 ${t} 条`,
        }}
      />

      <SpaceDetailDrawer
        spaceId={drawer.spaceId}
        open={drawer.open}
        defaultTab={drawer.tab}
        onClose={() => setDrawer({ open: false, spaceId: null, tab: 'members' })}
      />

      <Modal
        title="创建空间"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createLoading}
        okText="创建"
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{ join_mode: 0, max_users: 200 }}
          preserve={false}
        >
          <Form.Item
            name="creator_uid"
            label="拥有者"
            rules={[{ required: true, message: '请选择拥有者' }]}
            extra="管理员代建，该用户将成为空间拥有者"
          >
            <Select
              showSearch
              placeholder="按昵称 / 用户名 / UID 搜索"
              filterOption={false}
              onSearch={(v) => searchUsers(v.trim())}
              notFoundContent={userSearching ? <Spin size="small" /> : null}
              options={userOptions.map((u) => ({
                value: u.uid,
                label: (() => {
                  const sub = u.username || [u.email, u.phone].filter(Boolean).join(' / ')
                  return `${u.name}${sub ? ` (${sub})` : ''} · ${u.uid}`
                })(),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="空间名称"
            rules={[{ required: true, message: '请输入空间名称' }]}
          >
            <Input placeholder="例如：产品研发团队" maxLength={60} />
          </Form.Item>
          <Form.Item name="description" label="空间描述">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="logo" label="Logo URL">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="join_mode" label="加入方式">
            <Radio.Group>
              <Radio value={0}>直接加入</Radio>
              <Radio value={1}>需审批</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="max_users"
            label="人数上限"
            extra="0 表示不限"
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="preset_group_ids"
            label="预设群组（可选）"
            extra={'JSON 数组字符串，例如 ["g1","g2"]'}
          >
            <Input.TextArea rows={2} placeholder='["g1","g2"]' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
