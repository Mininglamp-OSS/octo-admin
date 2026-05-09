import { useState, useEffect } from 'react'
import { Modal, Form, Input, message } from 'antd'
import {
  updateAppBot,
  updateSpaceAppBot,
  type AppBot,
  type AppBotUpdateReq,
} from '../../api/app-bot'

interface Props {
  bot: AppBot | null
  spaceId?: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function EditModal({ bot, spaceId, open, onClose, onSuccess }: Props) {
  const [form] = Form.useForm<AppBotUpdateReq>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && bot) {
      form.setFieldsValue({
        display_name: bot.display_name,
        description: bot.description,
        avatar: bot.avatar,
        welcome_msg: bot.welcome_msg,
      })
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
      message.success('已更新')
      onSuccess()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={`编辑 ${bot?.display_name || ''}`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          name="display_name"
          label="显示名称"
          rules={[{ required: true, message: '请输入显示名称' }]}
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea maxLength={500} rows={3} />
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
    </Modal>
  )
}
