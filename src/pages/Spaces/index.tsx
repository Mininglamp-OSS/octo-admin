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
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import api from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import {
  MAX_USERS_HARD_CAP,
  createSpace,
  dissolveSpace,
  listDisabledSpaces,
  listSpaces,
  updateSpaceStatus,
  type Space as SpaceItem,
  type SpaceJoinMode,
  type SpaceStatus,
} from '../../api/space'
import { useAuthStore } from '../../store/auth'
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

const STATUS_META: Record<SpaceStatus, { textKey: string; tone: 'online' | 'destroyed' | 'banned' }> = {
  0: { textKey: 'status.dissolved', tone: 'destroyed' },
  1: { textKey: 'status.normal', tone: 'online' },
  2: { textKey: 'status.banned', tone: 'banned' },
}

export default function Spaces() {
  const { t } = useTranslation(['spaces', 'common'])
  const canWrite = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'space.write'),
  )
  const canDestructive = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'space.destructive'),
  )
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
      const params = new URLSearchParams({
        page_index: '1',
        page_size: '20',
        exclude_bot: '1',
        exclude_system: '1',
      })
      if (kw) params.append('keyword', kw)
      const res = await api.get<{ list: UserOptionRaw[] }>(
        `/v1/manager/user/list?${params}`,
      )
      if (seq === userSearchSeq.current) {
        const list = (res.data.list || []).filter(
          (u) => u.status === 1 && u.is_destroy !== 1,
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
    if (!canDestructive) return
    Modal.confirm({
      title: t('ban.title', { name: space.name }),
      content: t('ban.content'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await updateSpaceStatus(space.space_id, 2)
          message.success(t('ban.success'))
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleUnban = (space: SpaceItem) => {
    if (!canDestructive) return
    Modal.confirm({
      title: t('unban.title', { name: space.name }),
      onOk: async () => {
        try {
          await updateSpaceStatus(space.space_id, 1)
          message.success(t('unban.success'))
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleDissolve = (space: SpaceItem) => {
    if (!canDestructive) return
    Modal.confirm({
      title: t('dissolve.title', { name: space.name }),
      content: t('dissolve.content'),
      okButtonProps: { danger: true },
      okText: t('dissolve.ok'),
      onOk: async () => {
        try {
          await dissolveSpace(space.space_id)
          message.success(t('dissolve.success'))
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
    if (!canWrite) return
    const values = await createForm.validateFields()
    const preset = values.preset_group_ids?.trim()
    if (preset) {
      try {
        const parsed = JSON.parse(preset)
        if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string')) {
          message.error(t('create.presetInvalid'))
          return
        }
      } catch {
        message.error(t('create.presetJsonError'))
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
          ? t('create.successWithCode', { code: resp.invite_code })
          : t('create.success'),
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
      title: t('column.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <a className="cell-primary" onClick={() => openDetail(record.space_id)}>
          {name}
        </a>
      ),
    },
    {
      title: t('column.spaceId'),
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
      title: t('column.creator'),
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
      title: t('column.memberCount'),
      dataIndex: 'member_count',
      key: 'member_count',
      width: 90,
      render: (n) => <span className="cell-primary">{n}</span>,
    },
    {
      title: t('column.joinMode'),
      dataIndex: 'join_mode',
      key: 'join_mode',
      width: 110,
      render: (m: number) =>
        m === 0 ? (
          <span className="pill-outline neutral">{t('joinMode.direct')}</span>
        ) : (
          <span className="pill-outline warning">{t('joinMode.approval')}</span>
        ),
    },
    {
      title: t('column.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: SpaceStatus) => {
        const meta = STATUS_META[status]
        return <span className={`pill-dot ${meta.tone}`}>{t(meta.textKey)}</span>
      },
    },
    { title: t('column.createdAt'), dataIndex: 'created_at', key: 'created_at', width: 170 },
    {
      title: t('column.action'),
      key: 'action',
      width: 280,
      align: 'right',
      render: (_, record) => (
        <div className="row-actions" style={{ display: 'inline-flex', gap: 4 }}>
          <Button size="small" className="btn-row-edit" onClick={() => openDetail(record.space_id)}>
            {t('action.detail')}
          </Button>
          <Button
            size="small"
            className="btn-row-edit"
            onClick={() => openDetail(record.space_id, 'invites')}
          >
            {t('action.inviteCode')}
          </Button>
          {canDestructive && record.status === 1 && (
            <>
              <Button size="small" danger onClick={() => handleBan(record)}>
                {t('action.ban')}
              </Button>
              <Button size="small" danger onClick={() => handleDissolve(record)}>
                {t('action.dissolve')}
              </Button>
            </>
          )}
          {canDestructive && record.status === 2 && (
            <Button size="small" type="primary" ghost onClick={() => handleUnban(record)}>
              {t('action.unban')}
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">{t('title')}</h1>
      <p className="page-subtitle">{t('subtitle')}</p>

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as TabKey)}
        items={[
          { key: 'active', label: t('tab.active') },
          { key: 'disabled', label: t('tab.disabled') },
        ]}
      />

      <div className="toolbar">
        <Input
          placeholder={t('search.placeholder')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 280 }}
          allowClear
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          {t('common:action.search')}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
          {t('common:action.refresh')}
        </Button>
        <div className="toolbar-spacer" />
        {canWrite && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setCreateOpen(true)
              setUserOptions([])
              searchUsers('')
            }}
          >
            {t('action.create')}
          </Button>
        )}
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
          showTotal: (count) => t('common:table.total', { count }),
        }}
      />

      <SpaceDetailDrawer
        spaceId={drawer.spaceId}
        open={drawer.open}
        defaultTab={drawer.tab}
        onClose={() => setDrawer({ open: false, spaceId: null, tab: 'members' })}
        onUpdated={() => fetchData()}
      />

      <Modal
        title={t('create.title')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createLoading}
        okText={t('create.ok')}
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
            label={t('create.field.owner')}
            rules={[{ required: true, message: t('create.field.ownerRequired') }]}
            extra={t('create.field.ownerExtra')}
          >
            <Select
              showSearch
              placeholder={t('create.field.ownerPlaceholder')}
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
            label={t('create.field.name')}
            rules={[{ required: true, message: t('create.field.nameRequired') }]}
          >
            <Input placeholder={t('create.field.namePlaceholder')} maxLength={60} />
          </Form.Item>
          <Form.Item name="description" label={t('create.field.description')}>
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="logo" label={t('create.field.logo')}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="join_mode" label={t('create.field.joinMode')}>
            <Radio.Group>
              <Radio value={0}>{t('joinMode.direct')}</Radio>
              <Radio value={1}>{t('joinMode.approval')}</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="max_users"
            label={t('create.field.maxUsers')}
            extra={t('create.field.maxUsersExtra', { cap: MAX_USERS_HARD_CAP })}
            rules={[
              {
                validator: (_, value: number | undefined) => {
                  if (value === undefined || value === null) return Promise.resolve()
                  if (!Number.isInteger(value) || value < 0) {
                    return Promise.reject(new Error(t('create.field.maxUsersInvalid')))
                  }
                  if (value > MAX_USERS_HARD_CAP) {
                    return Promise.reject(
                      new Error(t('create.field.maxUsersExceed', { cap: MAX_USERS_HARD_CAP })),
                    )
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            {/* 与编辑路径 (SpaceInfoPanel) 共用同一 cap，避免 "创建得了但改不回去" 的不一致。
                precision=0 阻止小数；min/max 让 antd 的步进控件落在 [0, cap] 内。 */}
            <InputNumber
              min={0}
              max={MAX_USERS_HARD_CAP}
              precision={0}
              step={1}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item
            name="preset_group_ids"
            label={t('create.field.presetGroups')}
            extra={t('create.field.presetGroupsExtra')}
          >
            <Input.TextArea rows={2} placeholder='["g1","g2"]' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
