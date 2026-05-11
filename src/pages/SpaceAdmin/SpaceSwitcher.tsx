// Copyright 2026 MININGLAMP Technology and the OCTO contributors
// SPDX-License-Identifier: Apache-2.0

import { Select, Tag } from 'antd'
import { useAuthStore } from '../../store/auth'
import { useNavigate } from 'react-router-dom'

const ROLE_LABEL: Record<0 | 1 | 2, { text: string; color: string }> = {
  0: { text: '成员', color: 'default' },
  1: { text: '管理员', color: 'gold' },
  2: { text: '拥有者', color: 'geekblue' },
}

export default function SpaceSwitcher() {
  const mySpaces = useAuthStore((s) => s.mySpaces)
  const currentSpaceId = useAuthStore((s) => s.currentSpaceId)
  const setCurrentSpaceId = useAuthStore((s) => s.setCurrentSpaceId)
  const navigate = useNavigate()

  const options = mySpaces.map((s) => ({
    value: s.space_id,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {s.name}
        </span>
        <Tag color={ROLE_LABEL[s.role].color} style={{ margin: 0 }}>
          {ROLE_LABEL[s.role].text}
        </Tag>
      </span>
    ),
  }))

  return (
    <Select
      value={currentSpaceId || undefined}
      onChange={(id) => {
        setCurrentSpaceId(id)
        navigate(`/space/${id}/members`)
      }}
      options={options}
      style={{ minWidth: 240 }}
      placeholder="选择空间"
      variant="filled"
    />
  )
}
