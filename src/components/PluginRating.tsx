import { useEffect, useRef, useState } from 'react'
import { Button, Modal, Rate, Space, Typography, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api'
import { updatePluginRating } from '../api/plugin'

const { Text } = Typography

interface PluginRatingProps {
  pluginId: string
  rating: number | null
  canEdit?: boolean
  compact?: boolean
  onChanged?: (rating: number | null) => void
}

export default function PluginRating({
  pluginId,
  rating,
  canEdit = false,
  compact = false,
  onChanged,
}: PluginRatingProps) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<number | null>(rating)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!open) setDraft(rating)
  }, [rating, open])

  const showEditor = (event: React.MouseEvent) => {
    event.stopPropagation()
    setDraft(rating)
    setOpen(true)
  }

  const save = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await updatePluginRating(pluginId, draft)
      onChanged?.(draft)
      message.success(t('pluginRating.saved'))
      setOpen(false)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('pluginRating.saveFailed'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <Space size={compact ? 4 : 8} wrap={false} onClick={(event) => event.stopPropagation()}>
        <Rate disabled value={rating ?? 0} allowHalf={false} style={{ fontSize: compact ? 14 : 18 }} />
        {rating === null && <Text type="secondary">{t('pluginRating.unrated')}</Text>}
        {canEdit && (
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label={t('pluginRating.edit')}
            onClick={showEditor}
          />
        )}
      </Space>
      <Modal
        title={t('pluginRating.title')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={save}
        confirmLoading={saving}
        okText={t('action.confirm')}
        cancelText={t('action.cancel')}
        destroyOnClose
        wrapProps={{
          onClick: (event: React.MouseEvent<HTMLDivElement>) => {
            event.stopPropagation()
            if (event.target === event.currentTarget) setOpen(false)
          },
        }}
      >
        <Space direction="vertical" size={12}>
          <Text type="secondary">{t('pluginRating.hint')}</Text>
          <Rate value={draft ?? 0} onChange={(value) => setDraft(value || null)} />
          <Button type="link" danger disabled={draft === null} onClick={() => setDraft(null)}>
            {t('pluginRating.clear')}
          </Button>
        </Space>
      </Modal>
    </>
  )
}
