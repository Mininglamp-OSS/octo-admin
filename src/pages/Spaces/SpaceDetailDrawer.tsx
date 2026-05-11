// Copyright 2026 MININGLAMP Technology and the OCTO contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Drawer, Descriptions, Tabs, Skeleton, message } from 'antd'
import { getSpace, type Space, type SpaceStatus } from '../../api/space'
import { useSpaceScope } from '../../hooks/useSpaceScope'
import SpaceMembersPanel from './SpaceMembersPanel'
import SpaceInvitesPanel from './SpaceInvitesPanel'
import SpaceJoinAppliesPanel from './SpaceJoinAppliesPanel'

type TabKey = 'members' | 'invites' | 'join-applies'

interface Props {
  spaceId: string | null
  open: boolean
  onClose: () => void
  defaultTab?: TabKey
}

const STATUS_META: Record<SpaceStatus, { text: string; tone: 'online' | 'destroyed' | 'banned' }> = {
  0: { text: '已解散', tone: 'destroyed' },
  1: { text: '正常', tone: 'online' },
  2: { text: '已封禁', tone: 'banned' },
}

export default function SpaceDetailDrawer({
  spaceId,
  open,
  onClose,
  defaultTab = 'members',
}: Props) {
  const [loading, setLoading] = useState(false)
  const [space, setSpace] = useState<Space | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab)
  const scope = useSpaceScope()

  useEffect(() => {
    if (!open || !spaceId) {
      setSpace(null)
      return
    }
    setActiveTab(defaultTab)
    setLoading(true)
    getSpace(spaceId)
      .then(setSpace)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false))
  }, [open, spaceId, defaultTab])

  const readOnly = !!space && space.status !== 1

  return (
    <Drawer
      title={space ? `Space 详情 — ${space.name}` : 'Space 详情'}
      open={open}
      onClose={onClose}
      width={840}
      destroyOnClose
      className="admin-shell admin-drawer"
    >
      {loading || !space ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : (
        <>
          <Descriptions
            size="small"
            column={2}
            colon={false}
            style={{ marginBottom: 20 }}
            labelStyle={{
              color: 'var(--a-text-tertiary)',
              fontSize: 12,
              fontWeight: 500,
              width: 80,
              padding: '6px 0',
            }}
            contentStyle={{
              color: 'var(--a-text-primary)',
              fontSize: 13,
              padding: '6px 0',
            }}
          >
            <Descriptions.Item label="Space ID" span={2}>
              <span className="mono" style={{ color: 'var(--a-text-secondary)' }}>{space.space_id}</span>
            </Descriptions.Item>
            <Descriptions.Item label="名称">{space.name}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <span className={`pill-dot ${STATUS_META[space.status].tone}`}>
                {STATUS_META[space.status].text}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="创建者">
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                <span>{space.creator_name}</span>
                <span className="mono" style={{ color: 'var(--a-text-quaternary)', fontSize: 11 }}>
                  {space.creator?.slice(0, 12)}…
                </span>
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="加入方式">
              {space.join_mode === 0 ? (
                <span className="pill-outline neutral">直接加入</span>
              ) : (
                <span className="pill-outline warning">需审批</span>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="成员上限">
              {space.max_users === 0 ? '不限' : space.max_users}
            </Descriptions.Item>
            <Descriptions.Item label="当前成员">
              <span className="cell-primary">{space.member_count}</span>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              <span style={{ color: 'var(--a-text-secondary)' }}>{space.created_at}</span>
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              <span style={{ color: 'var(--a-text-secondary)' }}>{space.updated_at}</span>
            </Descriptions.Item>
            {space.description && (
              <Descriptions.Item label="简介" span={2}>
                <span style={{ color: 'var(--a-text-secondary)' }}>{space.description}</span>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Tabs
            destroyInactiveTabPane
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as TabKey)}
            items={[
              {
                key: 'members',
                label: '成员',
                children: (
                  <SpaceMembersPanel
                    spaceId={space.space_id}
                    scope={scope}
                    readOnly={readOnly}
                  />
                ),
              },
              {
                key: 'invites',
                label: '邀请码',
                children: (
                  <SpaceInvitesPanel
                    spaceId={space.space_id}
                    scope={scope}
                    readOnly={readOnly}
                  />
                ),
              },
              {
                key: 'join-applies',
                label: '加入申请',
                children: (
                  <SpaceJoinAppliesPanel
                    spaceId={space.space_id}
                    scope={scope}
                    readOnly={readOnly}
                  />
                ),
              },
            ]}
          />
        </>
      )}
    </Drawer>
  )
}
