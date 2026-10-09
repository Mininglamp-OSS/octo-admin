import { useEffect, useState } from 'react'
import { Button, Form, message, Modal, Select, Space, Typography } from 'antd'
import { BranchesOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api'
import {
  batchSetPluginPlacements,
  listPluginScenes,
  type PluginScene,
} from '../api/marketplace-scene'

interface Props {
  pluginIds: string[]
  onSuccess: () => void
}

interface FormValues {
  scene_code: string
}

export default function BulkPlacementAction({ pluginIds, onSuccess }: Props) {
  const { t } = useTranslation('marketplaceScene')
  const [open, setOpen] = useState(false)
  const [scenes, setScenes] = useState<PluginScene[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm<FormValues>()

  useEffect(() => {
    if (open) form.resetFields()
  }, [form, open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void listPluginScenes()
      .then((items) => { if (!cancelled) setScenes(items) })
      .catch((error) => message.error(error instanceof ApiError ? error.message : t('scene.error.load')))
    return () => { cancelled = true }
  }, [open, t])

  const show = () => {
    setOpen(true)
  }

  const submit = async () => {
    const submittedPluginIds = [...pluginIds]
    try {
      const values = await form.validateFields()
      setLoading(true)
      await batchSetPluginPlacements({
        scene_code: values.scene_code,
        plugin_ids: submittedPluginIds,
        is_placed: true,
      })
      message.success(t('bulk.success', { count: submittedPluginIds.length }))
      setOpen(false)
      onSuccess()
    } catch (error) {
      if (error instanceof ApiError) {
        const failedIndex = error.details?.failed_index
        const failedPluginId = typeof failedIndex === 'number' && Number.isInteger(failedIndex)
          ? submittedPluginIds[failedIndex]
          : undefined
        message.error(failedPluginId
          ? t('bulk.failedItem', { message: error.message, pluginId: failedPluginId })
          : error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const options = scenes
    .filter((scene) => scene.scene_code !== 'default')
    .map((scene) => ({ value: scene.scene_code, label: `${scene.name} (${scene.scene_code})` }))

  return (
    <>
      <Button icon={<BranchesOutlined />} disabled={pluginIds.length === 0} onClick={show}>
        {t('bulk.button')} {pluginIds.length > 0 ? `(${pluginIds.length})` : ''}
      </Button>
      <Modal open={open} title={t('bulk.title')} onCancel={() => setOpen(false)} onOk={submit} confirmLoading={loading} destroyOnHidden>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Text type="secondary">{t('bulk.selected', { count: pluginIds.length })}</Typography.Text>
          <Form form={form} layout="vertical" preserve={false}>
            <Form.Item name="scene_code" label={t('bulk.scene')} rules={[{ required: true }]}>
              <Select options={options} placeholder={t('bulk.scenePlaceholder')} />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </>
  )
}
