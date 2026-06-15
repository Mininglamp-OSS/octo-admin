import { useState, type ReactNode } from 'react'
import { Typography, Tooltip, message } from 'antd'
import { useTranslation } from 'react-i18next'
import InlineEditField from './InlineEditField'
import {
  MAX_USERS_HARD_CAP,
  updateSpaceProfile,
  type Space,
  type SpaceJoinMode,
  type SpaceStatus,
} from '../../api/space'

// 与服务端 modules/space/api_manager.go 中的字符上限保持一致。
const NAME_MAX = 100
const DESC_MAX = 500
const LOGO_MAX = 200

const STATUS_META: Record<SpaceStatus, { textKey: string; tone: 'online' | 'destroyed' | 'banned' }> = {
  0: { textKey: 'info.status.dissolved', tone: 'destroyed' },
  1: { textKey: 'info.status.normal', tone: 'online' },
  2: { textKey: 'info.status.banned', tone: 'banned' },
}

function runeCount(s: string): number {
  return Array.from(s).length
}

interface Props {
  space: Space
  readOnly?: boolean
  onSpaceChange: (next: Space) => void
  onUpdated?: () => void
}

interface FieldProps {
  label: string
  children: ReactNode
  span?: 1 | 2
}

function Field({ label, children, span = 1 }: FieldProps) {
  return (
    <div className={`space-info-field${span === 2 ? ' span-2' : ''}`}>
      <div className="space-info-label">{label}</div>
      <div className="space-info-value">{children}</div>
    </div>
  )
}

export default function SpaceInfoPanel({ space, readOnly = false, onSpaceChange, onUpdated }: Props) {
  const { t } = useTranslation('spaces')
  const editable = space.status === 1 && !readOnly
  const [logoBroken, setLogoBroken] = useState(false)

  const save = async <K extends keyof Space>(field: K, value: Space[K]) => {
    await updateSpaceProfile(space.space_id, {
      [field]: value,
    } as Parameters<typeof updateSpaceProfile>[1])
    onSpaceChange({ ...space, [field]: value })
    message.success(t('info.saved'))
    onUpdated?.()
  }

  const statusMeta = STATUS_META[space.status]

  return (
    <div className="space-info-card">
      <div className="space-info-header">
        <div className="space-info-header-main">
          <span className={`pill-dot ${statusMeta.tone}`}>{t(statusMeta.textKey)}</span>
          <Typography.Text
            copyable={{ text: space.space_id }}
            className="mono space-info-id"
          >
            {space.space_id}
          </Typography.Text>
        </div>
      </div>

      <div className="space-info-grid">
        <Field label={t('info.field.logo')} span={2}>
          <div className="space-info-logo-row">
            {space.logo && !logoBroken ? (
              <img
                src={space.logo}
                alt=""
                className="space-info-logo-thumb"
                onError={() => setLogoBroken(true)}
              />
            ) : (
              <div className="space-info-logo-thumb space-info-logo-placeholder" aria-hidden>
                {space.name?.trim().charAt(0) || '?'}
              </div>
            )}
            <div className="space-info-logo-url">
              <InlineEditField
                kind="text"
                value={space.logo}
                readOnly={!editable}
                maxLength={LOGO_MAX}
                placeholder="https://..."
                emptyText={t('info.logo.empty')}
                validate={(v) =>
                  runeCount(String(v)) > LOGO_MAX
                    ? t('info.logo.exceed', { max: LOGO_MAX })
                    : null
                }
                onSave={(v) => {
                  setLogoBroken(false)
                  return save('logo', String(v))
                }}
              />
            </div>
          </div>
        </Field>

        <Field label={t('info.field.name')}>
          <InlineEditField
            kind="text"
            value={space.name}
            readOnly={!editable}
            maxLength={NAME_MAX}
            placeholder={t('info.name.placeholder')}
            validate={(v) => {
              const trimmed = String(v).trim()
              if (!trimmed) return t('info.name.empty')
              if (runeCount(trimmed) > NAME_MAX) return t('info.name.exceed', { max: NAME_MAX })
              return null
            }}
            onSave={(v) => save('name', String(v))}
          />
        </Field>

        <Field label={t('info.field.joinMode')}>
          <InlineEditField
            kind="select"
            value={space.join_mode}
            readOnly={!editable}
            display={
              space.join_mode === 0 ? (
                <span className="pill-outline neutral">{t('info.joinMode.direct')}</span>
              ) : (
                <span className="pill-outline warning">{t('info.joinMode.approval')}</span>
              )
            }
            options={[
              { value: 0, label: t('info.joinMode.direct') },
              { value: 1, label: t('info.joinMode.approval') },
            ]}
            onSave={(v) => save('join_mode', Number(v) as SpaceJoinMode)}
          />
        </Field>

        <Field label={t('info.field.creator')}>
          <span className="space-info-creator">
            <span className="cell-primary">{space.creator_name}</span>
            {space.creator && (
              <Tooltip title={space.creator} mouseEnterDelay={0.2}>
                <span className="mono space-info-creator-id">
                  {space.creator.slice(0, 10)}…
                </span>
              </Tooltip>
            )}
          </span>
        </Field>

        <Field label={t('info.field.members')}>
          <span className="space-info-members">
            <span className="cell-primary">{space.member_count}</span>
            <span className="space-info-members-sep">/</span>
            <InlineEditField
              kind="number"
              value={space.max_users}
              readOnly={!editable}
              min={0}
              max={MAX_USERS_HARD_CAP}
              display={
                space.max_users === 0 ? (
                  <span style={{ color: 'var(--a-text-tertiary)' }}>{t('info.members.unlimited')}</span>
                ) : (
                  space.max_users
                )
              }
              validate={(v) => {
                const n = Number(v)
                if (n < 0) return t('info.members.negative')
                if (n > MAX_USERS_HARD_CAP) return t('info.members.exceed', { max: MAX_USERS_HARD_CAP })
                if (n > 0 && n < space.member_count) {
                  return t('info.members.belowCurrent', { max: n, current: space.member_count })
                }
                return null
              }}
              onSave={(v) => save('max_users', Number(v))}
            />
          </span>
        </Field>

        <Field label={t('info.field.createdAt')}>
          <span className="space-info-muted">{space.created_at}</span>
        </Field>

        <Field label={t('info.field.updatedAt')}>
          <span className="space-info-muted">{space.updated_at}</span>
        </Field>

        <Field label={t('info.field.description')} span={2}>
          <InlineEditField
            kind="textarea"
            value={space.description}
            readOnly={!editable}
            maxLength={DESC_MAX}
            rows={3}
            emptyText={t('info.description.empty')}
            display={
              space.description ? (
                <span
                  style={{
                    color: 'var(--a-text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {space.description}
                </span>
              ) : undefined
            }
            validate={(v) =>
              runeCount(String(v).trim()) > DESC_MAX
                ? t('info.description.exceed', { max: DESC_MAX })
                : null
            }
            onSave={(v) => save('description', String(v))}
          />
        </Field>
      </div>
    </div>
  )
}
