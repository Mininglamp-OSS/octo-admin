import { useState, useEffect } from 'react'
import { Drawer, Descriptions, Tag, Button, Typography, Popconfirm, Avatar, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { getSkill, deleteSkill, type SkillDetail } from '../../api/skill'

interface Props {
  skillId: string | null
  open: boolean
  onClose: () => void
  onDeleted: () => void
  onEdit: (skill: SkillDetail) => void
  canManage: boolean
}

const VISIBILITY_COLOR: Record<string, string> = {
  public: 'green',
  space: 'blue',
  private: 'default',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DetailDrawer({ skillId, open, onClose, onDeleted, onEdit, canManage }: Props) {
  const { t } = useTranslation('systemSkill')
  const [skill, setSkill] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !skillId) {
      setSkill(null)
      return
    }
    let stale = false
    setLoading(true)
    getSkill(skillId)
      .then((data) => { if (!stale) setSkill(data) })
      .catch((err: Error) => { if (!stale) message.error(err.message) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [open, skillId])

  const handleDelete = async () => {
    if (!skillId || !canManage) return
    try {
      await deleteSkill(skillId)
      message.success(t('toast.deleted'))
      onClose()
      onDeleted()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  return (
    <Drawer
      title={t('detail.title')}
      open={open}
      onClose={onClose}
      width={560}
      loading={loading}
    >
      {skill && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <Avatar src={skill.icon_url} size={56} style={{ background: '#6366f1' }}>
              {skill.display_name?.charAt(0)}
            </Avatar>
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {skill.display_name || skill.name}
              </Typography.Title>
              <Typography.Text type="secondary">{skill.description}</Typography.Text>
            </div>
          </div>

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('detail.field.name')}>{skill.name}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.displayName')}>{skill.display_name}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.category')}>{skill.category_name || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.tags')}>
              {skill.tags?.length ? skill.tags.map((tag) => <Tag key={tag}>{tag}</Tag>) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('detail.field.version')}>
              <Tag>{skill.version || '—'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('detail.field.owner')}>{skill.owner_name}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.visibility')}>
              <Tag color={VISIBILITY_COLOR[skill.visibility]}>
                {t(`visibility.${skill.visibility}` as any)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('detail.field.file')}>{skill.file_name || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.fileSize')}>
              {skill.file_size ? formatFileSize(skill.file_size) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('detail.field.sha256')}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                {skill.file_sha256 || '—'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label={t('detail.field.createdAt')}>{skill.created_at}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.updatedAt')}>{skill.updated_at}</Descriptions.Item>
          </Descriptions>

          {canManage && (
            <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
              <Button onClick={() => onEdit(skill)}>{t('action.edit')}</Button>
              <Popconfirm
                title={t('confirm.delete.title')}
                description={t('confirm.delete.desc')}
                onConfirm={handleDelete}
                okText={t('confirm.delete.ok')}
                cancelText={t('confirm.delete.cancel')}
              >
                <Button danger>{t('action.delete')}</Button>
              </Popconfirm>
            </div>
          )}
        </>
      )}
    </Drawer>
  )
}
