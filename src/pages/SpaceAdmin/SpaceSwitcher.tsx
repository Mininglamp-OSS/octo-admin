import { Select, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/auth'
import { useNavigate } from 'react-router-dom'

const ROLE_META: Record<0 | 1 | 2, { key: string; color: string }> = {
  0: { key: 'role.member', color: 'default' },
  1: { key: 'role.admin', color: 'gold' },
  2: { key: 'role.owner', color: 'geekblue' },
}

export default function SpaceSwitcher() {
  const { t } = useTranslation('spaceAdmin')
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
        <Tag color={ROLE_META[s.role].color} style={{ margin: 0 }}>
          {t(ROLE_META[s.role].key)}
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
      placeholder={t('switcher.placeholder')}
      variant="filled"
    />
  )
}
