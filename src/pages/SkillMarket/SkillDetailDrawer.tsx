import { useEffect, useState } from 'react'
import { Descriptions, Drawer, Spin, Tag, Space, Button, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { getAdminSkill, getSkillMd, getAdminSkillDownloadUrl, type SkillDetail, type CategoryItem } from '../../api/skill'

interface Props {
  open: boolean
  skillId: string | null
  categories: CategoryItem[]
  onClose: () => void
}

export default function SkillDetailDrawer({ open, skillId, categories, onClose }: Props) {
  const { t } = useTranslation(['skillMarket'])
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [skillMd, setSkillMd] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !skillId) {
      setDetail(null)
      setSkillMd('')
      return
    }
    setLoading(true)
    Promise.all([
      getAdminSkill(skillId),
      getSkillMd(skillId).catch(() => ''),
    ])
      .then(([d, md]) => {
        setDetail(d)
        setSkillMd(md)
      })
      .catch(() => {
        message.error(t('skill.loadFailed'))
      })
      .finally(() => setLoading(false))
  }, [open, skillId, t])

  const getCategoryName = (catId: string) => {
    const cat = categories.find((c) => c.skill_category_id === catId)
    return cat?.name ?? catId
  }

  return (
    <Drawer
      title={t('skill.detailDrawer.title')}
      open={open}
      onClose={onClose}
      width={560}
      destroyOnClose
    >
      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spin />
        </div>
      ) : detail ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            {detail.icon_url && (
              <img
                src={detail.icon_url}
                alt=""
                style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }}
              />
            )}
            <div>
              <h3 style={{ margin: 0 }}>{detail.display_name || detail.name}</h3>
              <p style={{ margin: 0, color: '#666' }}>{detail.description}</p>
            </div>
          </div>
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 20 }}>
            <Descriptions.Item label={t('skill.detailDrawer.version')}>
              {detail.version}
            </Descriptions.Item>
            <Descriptions.Item label={t('skill.detailDrawer.category')}>
              {getCategoryName(detail.category_id)}
            </Descriptions.Item>
            <Descriptions.Item label={t('skill.detailDrawer.views')}>
              {detail.view_count}
            </Descriptions.Item>
            <Descriptions.Item label={t('skill.detailDrawer.downloads')}>
              {detail.download_count}
            </Descriptions.Item>
            <Descriptions.Item label={t('skill.detailDrawer.createdAt')}>
              {detail.created_at ? new Date(detail.created_at).toLocaleString() : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('skill.detailDrawer.updatedAt')}>
              {detail.updated_at ? new Date(detail.updated_at).toLocaleString() : '-'}
            </Descriptions.Item>
          </Descriptions>
          {detail.tags && detail.tags.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <strong>{t('skill.detailDrawer.tags')}:</strong>{' '}
              <Space size={[0, 4]} wrap style={{ marginLeft: 8 }}>
                {detail.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </Space>
            </div>
          )}
          {skillMd && (
            <div style={{ marginBottom: 16 }}>
              <h4>{t('skill.detailDrawer.skillMd')}</h4>
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 400,
                  overflow: 'auto',
                  fontSize: 13,
                }}
              >
                {skillMd}
              </pre>
            </div>
          )}
          <Button
            icon={<DownloadOutlined />}
            type="primary"
            onClick={async () => {
              try {
                const url = await getAdminSkillDownloadUrl(detail.skill_id)
                window.open(url, '_blank')
              } catch {
                message.error(t('skill.loadFailed'))
              }
            }}
          >
            {t('skill.detailDrawer.download')}
          </Button>
        </div>
      ) : null}
    </Drawer>
  )
}
