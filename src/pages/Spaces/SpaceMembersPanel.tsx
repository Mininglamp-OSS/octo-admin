import { useEffect, useState } from 'react'
import { Table, Input, Button, Dropdown, Modal, Form, Tooltip, Typography, message } from 'antd'
import type { MenuProps } from 'antd'
import {
  CheckCircleOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserAddOutlined,
  UserSwitchOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'

const { Text } = Typography
import { useAuthStore } from '../../store/auth'
import type {
  MemberItem,
  SpaceScope,
  SpaceMemberRole,
} from '../../hooks/useSpaceScope'

interface Props {
  spaceId: string
  scope: SpaceScope
  readOnly?: boolean
  onRoleChanged?: () => void
}

const ROLE_LABEL: Record<SpaceMemberRole, { textKey: string; tone: 'neutral' | 'warning' | 'brand' }> = {
  0: { textKey: 'members.role.member', tone: 'neutral' },
  1: { textKey: 'members.role.admin', tone: 'warning' },
  2: { textKey: 'members.role.owner', tone: 'brand' },
}

const PAGE_SIZE = 20

export default function SpaceMembersPanel({ spaceId, scope, readOnly = false, onRoleChanged }: Props) {
  const { t } = useTranslation(['spaces', 'common'])
  const viewerUid = useAuthStore((s) => s.uid)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<MemberItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [form] = Form.useForm<{ uids: string }>()

  const canAdd = !readOnly && scope.canAddMembers
  const canRemove = !readOnly && scope.canRemoveMembers
  const canChangeRole = !readOnly && (scope.kind === 'super' || scope.role === 2)

  const fetchData = async (nextPage = page, kw = keyword) => {
    setLoading(true)
    try {
      const res = await scope.api.listMembers(spaceId, {
        page_index: nextPage,
        page_size: PAGE_SIZE,
        keyword: kw || undefined,
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
    fetchData(1, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, scope.kind])

  const handleSearch = () => {
    setPage(1)
    fetchData(1, keyword)
  }

  const handleChangeRole = (uid: string, name: string, role: SpaceMemberRole) => {
    const roleText = t(ROLE_LABEL[role].textKey)
    Modal.confirm({
      title: t('members.changeRole.title', { name, role: roleText }),
      content:
        role === 2
          ? t('members.changeRole.ownerContent')
          : undefined,
      onOk: async () => {
        try {
          await scope.api.updateMemberRole(spaceId, uid, role)
          message.success(t('members.changeRole.success'))
          fetchData()
          // 角色变更可能改变当前用户自身权限(如转让所有权后被降级),
          // 通知上层重新校验 scope,避免操作入口残留到刷新前。
          onRoleChanged?.()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleRemove = (uid: string, name: string) => {
    Modal.confirm({
      title: t('members.remove.title', { name }),
      okButtonProps: { danger: true },
      okText: t('members.remove.ok'),
      onOk: async () => {
        try {
          await scope.api.removeMembers(spaceId, [uid])
          message.success(t('members.remove.success'))
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleAdd = async () => {
    const { uids } = await form.validateFields()
    const list = uids
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (list.length === 0) return
    if (list.length > 200) {
      message.error(t('members.add.tooMany'))
      return
    }
    if (!scope.api.addMembers) return
    setAddLoading(true)
    try {
      await scope.api.addMembers(spaceId, list)
      message.success(t('members.add.success', { count: list.length }))
      setAddOpen(false)
      form.resetFields()
      fetchData()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setAddLoading(false)
    }
  }

  const actionColumn =
    !canRemove && !canChangeRole
      ? null
      : ({
          title: t('members.column.action'),
          key: 'action',
          width: 180,
          render: (_: unknown, record: MemberItem) => {
            if (record.status !== undefined && record.status !== 1)
              return <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>
            const items: MenuProps['items'] = []
            // 不对当前登录用户自己的行展示角色操作:owner 无法自降级、
            // 也无需对自己做转让/升降级,这些请求注定被后端拒绝。
            if (canChangeRole && record.uid !== viewerUid) {
              if (record.role !== 2) {
                items.push({
                  key: 'owner',
                  label: t('members.action.toOwner'),
                  onClick: () => handleChangeRole(record.uid, record.name, 2),
                })
              }
              if (record.role === 0) {
                items.push({
                  key: 'admin-up',
                  label: t('members.action.promoteAdmin'),
                  onClick: () => handleChangeRole(record.uid, record.name, 1),
                })
              }
              if (record.role === 1) {
                items.push({
                  key: 'admin-down',
                  label: t('members.action.demoteMember'),
                  onClick: () => handleChangeRole(record.uid, record.name, 0),
                })
              }
            }
            if (!canRemove && items.length === 0) {
              return <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>
            }
            return (
              <div className="row-actions" style={{ display: 'inline-flex', gap: 4 }}>
                {items.length > 0 && (
                  <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
                    <Button size="small" className="btn-row-edit" icon={<UserSwitchOutlined />}>
                      {t('members.action.role')}
                    </Button>
                  </Dropdown>
                )}
                {canRemove && record.role !== 2 && (
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<UserDeleteOutlined />}
                    onClick={() => handleRemove(record.uid, record.name)}
                  >
                    {t('members.action.remove')}
                  </Button>
                )}
              </div>
            )
          },
        })

  const baseColumns: ColumnsType<MemberItem> = [
    {
      title: t('members.column.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <span className="cell-primary">
          {name}
          {record.robot === 1 && (
            <span
              className="pill-outline neutral"
              style={{ marginLeft: 8, fontSize: 11 }}
            >
              Bot
            </span>
          )}
        </span>
      ),
    },
    {
      title: t('members.column.uid'),
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
      title: t('members.column.role'),
      dataIndex: 'role',
      key: 'role',
      width: 110,
      render: (role: SpaceMemberRole) => (
        <span className={`pill-outline ${ROLE_LABEL[role].tone}`}>
          {t(ROLE_LABEL[role].textKey)}
        </span>
      ),
    },
    {
      title: t('members.column.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: number | undefined) =>
        status === undefined || status === 1 ? (
          <span className="pill-icon online">
            <CheckCircleOutlined />
            {t('members.status.active')}
          </span>
        ) : (
          <span className="pill-icon destroyed">
            <MinusCircleOutlined />
            {t('members.status.removed')}
          </span>
        ),
    },
    { title: t('members.column.joinedAt'), dataIndex: 'created_at', key: 'created_at', width: 170 },
  ]

  const columns: ColumnsType<MemberItem> = actionColumn
    ? [...baseColumns, { ...actionColumn, align: 'right' as const }]
    : baseColumns

  return (
    <div>
      <div className="toolbar toolbar-plain">
        <Input
          placeholder={t(
            scope.kind === 'super'
              ? 'members.search.placeholderSuper'
              : 'members.search.placeholder',
          )}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 240 }}
          allowClear
        />
        <Button icon={<SearchOutlined />} onClick={handleSearch}>
          {t('common:action.search')}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
          {t('common:action.refresh')}
        </Button>
        <div className="toolbar-spacer" />
        {canAdd && (
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => setAddOpen(true)}
          >
            {t('members.add')}
          </Button>
        )}
      </div>
      <Table<MemberItem>
        columns={columns}
        dataSource={data}
        rowKey="uid"
        loading={loading}
        size="middle"
        scroll={{ x: 'max-content' }}
        pagination={
          total > PAGE_SIZE
            ? {
                current: page,
                total,
                pageSize: PAGE_SIZE,
                showTotal: (count) => t('common:table.total', { count }),
                onChange: (p) => {
                  setPage(p)
                  fetchData(p)
                },
              }
            : false
        }
      />

      <Modal
        title={t('members.addModal.title')}
        open={addOpen}
        onOk={handleAdd}
        onCancel={() => setAddOpen(false)}
        confirmLoading={addLoading}
        okText={t('members.addModal.ok')}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="uids"
            label={t('members.addModal.field.label')}
            rules={[{ required: true, message: t('members.addModal.field.required') }]}
            extra={t('members.addModal.field.extra')}
          >
            <Input.TextArea rows={4} placeholder={t('members.addModal.field.placeholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
