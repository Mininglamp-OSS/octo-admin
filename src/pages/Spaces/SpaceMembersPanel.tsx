// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Octo Contributors

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

const { Text } = Typography
import { updateSpaceMemberRole, type SpaceMemberRole } from '../../api/space'
import type { MemberItem, SpaceScope } from '../../hooks/useSpaceScope'

interface Props {
  spaceId: string
  scope: SpaceScope
  readOnly?: boolean
}

const ROLE_LABEL: Record<SpaceMemberRole, { text: string; tone: 'neutral' | 'warning' | 'brand' }> = {
  0: { text: '成员', tone: 'neutral' },
  1: { text: '管理员', tone: 'warning' },
  2: { text: '拥有者', tone: 'brand' },
}

const PAGE_SIZE = 20

export default function SpaceMembersPanel({ spaceId, scope, readOnly = false }: Props) {
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
  const canChangeRole = !readOnly && scope.kind === 'super'

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
    const roleText = ROLE_LABEL[role].text
    Modal.confirm({
      title: `确认将 ${name} 设为「${roleText}」？`,
      content:
        role === 2
          ? '设置为拥有者将触发原子所有权转让，当前拥有者会自动降级为管理员。'
          : undefined,
      onOk: async () => {
        try {
          await updateSpaceMemberRole(spaceId, uid, role)
          message.success('角色已更新')
          fetchData()
        } catch (error) {
          message.error((error as Error).message)
        }
      },
    })
  }

  const handleRemove = (uid: string, name: string) => {
    Modal.confirm({
      title: `确认移除成员 ${name}？`,
      okButtonProps: { danger: true },
      okText: '移除',
      onOk: async () => {
        try {
          await scope.api.removeMembers(spaceId, [uid])
          message.success('已移除')
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
      message.error('单次最多 200 个 UID')
      return
    }
    if (!scope.api.addMembers) return
    setAddLoading(true)
    try {
      await scope.api.addMembers(spaceId, list)
      message.success(`已添加 ${list.length} 个成员`)
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
          title: '操作',
          key: 'action',
          width: 180,
          render: (_: unknown, record: MemberItem) => {
            if (record.status !== undefined && record.status !== 1)
              return <span style={{ color: 'var(--a-text-quaternary)' }}>—</span>
            const items: MenuProps['items'] = []
            if (canChangeRole) {
              if (record.role !== 2) {
                items.push({
                  key: 'owner',
                  label: '转让为拥有者',
                  onClick: () => handleChangeRole(record.uid, record.name, 2),
                })
              }
              if (record.role === 0) {
                items.push({
                  key: 'admin-up',
                  label: '升为管理员',
                  onClick: () => handleChangeRole(record.uid, record.name, 1),
                })
              }
              if (record.role === 1) {
                items.push({
                  key: 'admin-down',
                  label: '降为成员',
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
                      角色
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
                    移除
                  </Button>
                )}
              </div>
            )
          },
        })

  const baseColumns: ColumnsType<MemberItem> = [
    {
      title: '昵称',
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
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 110,
      render: (role: SpaceMemberRole) => (
        <span className={`pill-outline ${ROLE_LABEL[role].tone}`}>
          {ROLE_LABEL[role].text}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: number | undefined) =>
        status === undefined || status === 1 ? (
          <span className="pill-icon online">
            <CheckCircleOutlined />
            活跃
          </span>
        ) : (
          <span className="pill-icon destroyed">
            <MinusCircleOutlined />
            已移除
          </span>
        ),
    },
    { title: '加入时间', dataIndex: 'created_at', key: 'created_at', width: 170 },
  ]

  const columns: ColumnsType<MemberItem> = actionColumn
    ? [...baseColumns, { ...actionColumn, align: 'right' as const }]
    : baseColumns

  return (
    <div>
      <div className="toolbar toolbar-plain">
        <Input
          placeholder="搜索 UID / 昵称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 240 }}
          allowClear
        />
        <Button icon={<SearchOutlined />} onClick={handleSearch}>
          搜索
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
          刷新
        </Button>
        <div className="toolbar-spacer" />
        {canAdd && (
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => setAddOpen(true)}
          >
            添加成员
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
                showTotal: (t) => `共 ${t} 条`,
                onChange: (p) => {
                  setPage(p)
                  fetchData(p)
                },
              }
            : false
        }
      />

      <Modal
        title="添加成员"
        open={addOpen}
        onOk={handleAdd}
        onCancel={() => setAddOpen(false)}
        confirmLoading={addLoading}
        okText="添加"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="uids"
            label="用户 UID"
            rules={[{ required: true, message: '请输入 UID' }]}
            extra="多个 UID 用逗号或空格分隔，单次上限 200，自动去重；此接口绕过 max_users 限制"
          >
            <Input.TextArea rows={4} placeholder="例如：uid1, uid2, uid3" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
