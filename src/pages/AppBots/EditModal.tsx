import { useState, useEffect } from 'react'
import { Modal, Form, Input, Avatar, Upload, message } from 'antd'
import { CameraOutlined, LoadingOutlined, RobotOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  updateAppBot,
  updateSpaceAppBot,
  uploadAppBotAvatar,
  botAvatarUrl,
  type AppBot,
  type AppBotUpdateReq,
} from '../../api/app-bot'

interface Props {
  bot: AppBot | null
  spaceId?: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onAvatarUploaded?: (uid: string) => void
}

export default function EditModal({ bot, spaceId, open, onClose, onSuccess, onAvatarUploaded }: Props) {
  const { t } = useTranslation('appBots')
  const [form] = Form.useForm<AppBotUpdateReq>()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarVersion, setAvatarVersion] = useState(Date.now)

  useEffect(() => {
    if (open && bot) {
      form.setFieldsValue({
        display_name: bot.display_name,
        description: bot.description,
        welcome_msg: bot.welcome_msg,
      })
      setAvatarVersion(Date.now())
    }
  }, [open, bot, form])

  const handleOk = async () => {
    if (!bot) return
    try {
      const values = await form.validateFields()
      setLoading(true)
      spaceId
        ? await updateSpaceAppBot(spaceId, bot.id, values)
        : await updateAppBot(bot.id, values)
      message.success(t('edit.toast.updated'))
      onSuccess()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAvatarUpload = async (file: File) => {
    if (!bot) return false
    setUploading(true)
    try {
      await uploadAppBotAvatar(bot.uid, file)
      message.success(t('detail.avatar.toast.updated'))
      setAvatarVersion(Date.now())
      onAvatarUploaded?.(bot.uid)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setUploading(false)
    }
    return false // prevent antd default upload behavior
  }

  return (
    <Modal
      title={t('edit.title', { name: bot?.display_name || '' })}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      destroyOnClose
    >
      {/* Avatar upload */}
      {bot && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={handleAvatarUpload}
            disabled={uploading}
          >
            <div
              style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
              title={t('detail.avatar.title')}
            >
              <Avatar
                src={botAvatarUrl(bot.uid, avatarVersion)}
                icon={<RobotOutlined />}
                size={80}
                style={{ background: '#6366f1' }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  background: '#fff',
                  borderRadius: '50%',
                  padding: 4,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  lineHeight: 1,
                }}
              >
                {uploading ? <LoadingOutlined style={{ fontSize: 14 }} /> : <CameraOutlined style={{ fontSize: 14, color: '#6366f1' }} />}
              </div>
            </div>
          </Upload>
          <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>{t('detail.avatar.hint')}</div>
        </div>
      )}

      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          name="display_name"
          label={t('form.displayName.label')}
          rules={[{ required: true, message: t('form.displayName.required') }]}
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item name="description" label={t('form.description.label')}>
          <Input.TextArea maxLength={500} rows={3} />
        </Form.Item>
        <Form.Item name="welcome_msg" label={t('form.welcome.label')} extra={t('form.welcome.extra')}>
          <Input.TextArea placeholder={t('form.welcome.placeholder')} maxLength={500} rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
