import { useState } from 'react'
import { Button, Form, Input, Modal, Space, Typography, message } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { createAppBot, createSpaceAppBot, type AppBotCreateReq } from '../../api/app-bot'
import { buildConnectGuide } from './connectGuide'

interface Props {
  open: boolean
  spaceId?: string
  onClose: () => void
  onSuccess: () => void
}

interface CreatedBotInfo {
  id: string
  displayName: string
  token: string
}

/** Copy text to clipboard with fallback */
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export default function CreateModal({ open, spaceId, onClose, onSuccess }: Props) {
  const { t } = useTranslation('appBots')
  const [form] = Form.useForm<AppBotCreateReq>()
  const [loading, setLoading] = useState(false)
  const [createdBot, setCreatedBot] = useState<CreatedBotInfo | null>(null)

  const handleOk = async () => {
    // If token is showing, this is the "I've saved it" confirmation
    if (createdBot) {
      setCreatedBot(null)
      form.resetFields()
      onSuccess()
      return
    }
    try {
      const values = await form.validateFields()
      setLoading(true)
      const resp = spaceId
        ? await createSpaceAppBot(spaceId, values)
        : await createAppBot(values)
      // Show token and bind guide together; user must explicitly dismiss.
      setCreatedBot({
        id: resp.id || values.id,
        displayName: values.display_name,
        token: resp.token,
      })
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (createdBot) {
      // Already created, treat cancel as confirm
      setCreatedBot(null)
      form.resetFields()
      onSuccess()
      return
    }
    onClose()
  }

  const handleCopyToken = async () => {
    if (!createdBot) return
    try {
      await copyToClipboard(createdBot.token)
      message.success(t('create.token.copied'))
    } catch {
      message.error(t('create.token.copyFailed'))
    }
  }

  const handleCopyGuide = async () => {
    if (!createdBot) return
    try {
      await copyToClipboard(
        buildConnectGuide(
          {
            displayName: createdBot.displayName,
            botId: createdBot.id,
            token: createdBot.token,
          },
          t,
        ),
      )
      message.success(t('create.guide.copied'))
    } catch {
      message.error(t('create.token.copyFailed'))
    }
  }

  const connectGuide = createdBot
    ? buildConnectGuide(
      {
        displayName: createdBot.displayName,
        botId: createdBot.id,
        token: createdBot.token,
      },
      t,
    )
    : ''

  return (
    <Modal
      title={createdBot ? t('create.title.success') : t('create.title')}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={createdBot ? t('create.ok.success') : t('create.ok')}
      confirmLoading={loading}
      destroyOnClose
      width={createdBot ? 680 : undefined}
    >
      {createdBot ? (
        <div>
          <Typography.Paragraph type="warning" style={{ marginBottom: 12 }}>
            {t('create.warning')}
          </Typography.Paragraph>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {t('create.token.title')}
          </Typography.Title>
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--a-bg-tertiary, #f5f5f5)',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 13,
              wordBreak: 'break-all',
              marginBottom: 12,
            }}
          >
            {createdBot.token}
          </div>
          <Button size="small" icon={<CopyOutlined />} onClick={handleCopyToken}>
            {t('create.token.copy')}
          </Button>

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            {t('create.guide.title')}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            {t('create.guide.intro')}
          </Typography.Paragraph>
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--a-bg-tertiary, #f5f5f5)',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.6,
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap',
            }}
          >
            {connectGuide}
          </div>
          <Space style={{ marginTop: 12 }}>
            <Button size="small" icon={<CopyOutlined />} onClick={handleCopyGuide}>
              {t('create.guide.copy')}
            </Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
            {t('create.guide.footer')}
          </Typography.Paragraph>
        </div>
      ) : (
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="id"
            label={t('form.id.label')}
            rules={[
              { required: true, message: t('form.id.required') },
              {
                pattern: /^[a-z0-9][a-z0-9_-]{0,29}$/,
                message: t('form.id.pattern'),
              },
            ]}
            extra={t('form.id.extra')}
          >
            <Input placeholder="octo-butler" />
          </Form.Item>
          <Form.Item
            name="display_name"
            label={t('form.displayName.label')}
            rules={[{ required: true, message: t('form.displayName.required') }]}
          >
            <Input placeholder={t('form.displayName.placeholder')} maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label={t('form.description.label')}>
            <Input.TextArea placeholder={t('form.description.placeholder')} maxLength={500} rows={3} />
          </Form.Item>
          <Form.Item name="welcome_msg" label={t('form.welcome.label')} extra={t('form.welcome.extra')}>
            <Input.TextArea placeholder={t('form.welcome.placeholder')} maxLength={500} rows={2} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
