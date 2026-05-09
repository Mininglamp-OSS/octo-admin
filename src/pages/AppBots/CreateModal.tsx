import { useState } from 'react'
import { Modal, Form, Input, Typography, message } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import { createAppBot, createSpaceAppBot, type AppBotCreateReq } from '../../api/app-bot'

interface Props {
  open: boolean
  spaceId?: string
  onClose: () => void
  onSuccess: () => void
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
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  const handleOk = async () => {
    // If token is showing, this is the "I've saved it" confirmation
    if (createdToken) {
      setCreatedToken(null)
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
      // Show token — user must explicitly dismiss
      setCreatedToken(resp.token)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (createdToken) {
      // Already created, treat cancel as confirm
      setCreatedToken(null)
      form.resetFields()
      onSuccess()
      return
    }
    onClose()
  }

  const handleCopyToken = async () => {
    if (!createdToken) return
    try {
      await copyToClipboard(createdToken)
      message.success('Token copied')
    } catch {
      message.error('复制失败')
    }
  }

  return (
    <Modal
      title={createdToken ? '✅ 创建成功 — 请保存 Token' : '创建应用 Bot'}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={createdToken ? '已保存，关闭' : '确定'}
      confirmLoading={loading}
      destroyOnClose
    >
      {createdToken ? (
        <div>
          <Typography.Paragraph type="warning" style={{ marginBottom: 12 }}>
            ℹ️ Token 仅在创建时显示一次，关闭后无法再次查看。请立即复制并安全保存。
          </Typography.Paragraph>
          <div
            style={{
              padding: '12px 16px',
              background: '#f5f5f5',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 13,
              wordBreak: 'break-all',
              marginBottom: 12,
            }}
          >
            {createdToken}
          </div>
          <Typography.Link onClick={handleCopyToken}>
            <CopyOutlined /> 点击复制 Token
          </Typography.Link>
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
        <Form.Item
          name="avatar"
          label="头像 URL"
          rules={[
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve()
                try {
                  const url = new URL(value)
                  if (url.protocol === 'http:' || url.protocol === 'https:') {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('仅支持 http/https 协议'))
                } catch {
                  return Promise.reject(new Error('请输入有效的 URL'))
                }
              },
            },
          ]}
        >
          <Input placeholder="https://..." />
        </Form.Item>
        <Form.Item name="welcome_msg" label="欢迎语" extra="用户首次连接时自动发送的消息，留空则使用默认提示">
          <Input.TextArea placeholder="你好！我是 xx 助手，有什么可以帮你的？" maxLength={500} rows={2} />
        </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
