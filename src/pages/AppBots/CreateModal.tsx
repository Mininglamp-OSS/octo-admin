import { useState } from 'react'
import { Button, Form, Input, Modal, Space, Typography, message } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
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
      message.success('Token copied')
    } catch {
      message.error('复制失败')
    }
  }

  const handleCopyGuide = async () => {
    if (!createdBot) return
    try {
      await copyToClipboard(
        buildConnectGuide({
          displayName: createdBot.displayName,
          botId: createdBot.id,
          token: createdBot.token,
        }),
      )
      message.success('连接指南已复制')
    } catch {
      message.error('复制失败')
    }
  }

  const connectGuide = createdBot
    ? buildConnectGuide({
      displayName: createdBot.displayName,
      botId: createdBot.id,
      token: createdBot.token,
    })
    : ''

  return (
    <Modal
      title={createdBot ? '创建成功 - 请保存 Token 并完成绑定' : '创建应用 Bot'}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={createdBot ? '已保存，关闭' : '确定'}
      confirmLoading={loading}
      destroyOnClose
      width={createdBot ? 680 : undefined}
    >
      {createdBot ? (
        <div>
          <Typography.Paragraph type="warning" style={{ marginBottom: 12 }}>
            Token 仅在创建时完整显示一次。请复制 Token，并将连接指南发给 OpenClaw 执行完成绑定。
          </Typography.Paragraph>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            API Token
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
            复制 Token
          </Button>

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            连接指南
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            将以下内容发给 OpenClaw 执行，即可将此 Bot 绑定到 Agent：
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
              复制指南
            </Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
            如需绑定到其他 Agent，修改 --agent 参数即可。断开连接请在 BotFather 中发送 /disconnect。
          </Typography.Paragraph>
        </div>
      ) : (
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="id"
            label="Bot ID"
            rules={[
              { required: true, message: '请输入 Bot ID' },
              {
                pattern: /^[a-z0-9][a-z0-9_-]{0,29}$/,
                message: '小写字母/数字/下划线/短横，1-30 字符',
              },
            ]}
            extra="唯一标识，创建后不可修改。如：octo-butler"
          >
            <Input placeholder="octo-butler" />
          </Form.Item>
          <Form.Item
            name="display_name"
            label="显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="Octo 管家" maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="智能工作助手，支持..." maxLength={500} rows={3} />
          </Form.Item>
          <Form.Item name="welcome_msg" label="欢迎语" extra="用户首次连接时自动发送的消息，留空则使用默认提示">
            <Input.TextArea placeholder="你好！我是 xx 助手，有什么可以帮你的？" maxLength={500} rows={2} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
