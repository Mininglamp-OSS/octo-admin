import { useEffect, useState } from 'react'
import { Button, Form, InputNumber, message, Modal, Select, Space, Switch, Typography } from 'antd'
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
  operation: 'add' | 'remove'
  scene_code: string
  is_visible: boolean
  sort_order: number
}

export default function BulkPlacementAction({ pluginIds, onSuccess }: Props) {
  const { t } = useTranslation('marketplaceScene')
  const [open, setOpen] = useState(false)
  const [scenes, setScenes] = useState<PluginScene[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const operation = Form.useWatch('operation', form) ?? 'add'
  const sceneCode = Form.useWatch('scene_code', form)

  useEffect(() => {
    if (!open) return
    void listPluginScenes()
      .then(setScenes)
      .catch((error) => message.error(error instanceof ApiError ? error.message : t('scene.error.load')))
  }, [open, t])

  const show = () => {
    form.resetFields()
    form.setFieldsValue({ operation: 'add', is_visible: true, sort_order: 100 })
    setOpen(true)
  }

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      await batchSetPluginPlacements({
        scene_code: values.scene_code,
        plugin_ids: pluginIds,
        is_placed: values.operation === 'add',
        is_visible: values.operation === 'add' ? values.is_visible : undefined,
        sort_order: values.operation === 'add' ? values.sort_order : undefined,
      })
      message.success(t(values.operation === 'add' ? 'bulk.success.added' : 'bulk.success.removed', { count: pluginIds.length }))
      setOpen(false)
      onSuccess()
    } catch (error) {
      if (error instanceof ApiError) message.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const options = scenes
    .filter((scene) => operation === 'add' || scene.scene_code !== 'default')
    .map((scene) => ({ value: scene.scene_code, label: `${scene.name} (${scene.scene_code})` }))

  return (
    <>
      <Button icon={<BranchesOutlined />} disabled={pluginIds.length === 0} onClick={show}>
        {t('bulk.button')} {pluginIds.length > 0 ? `(${pluginIds.length})` : ''}
      </Button>
      <Modal open={open} title={t('bulk.title')} onCancel={() => setOpen(false)} onOk={submit} confirmLoading={loading} destroyOnClose>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Text type="secondary">{t('bulk.selected', { count: pluginIds.length })}</Typography.Text>
          <Form form={form} layout="vertical" preserve={false} initialValues={{ operation: 'add', is_visible: true, sort_order: 100 }}>
            <Form.Item name="operation" label={t('bulk.operation')} rules={[{ required: true }]}>
              <Select options={[
                { value: 'add', label: t('bulk.add') },
                { value: 'remove', label: t('bulk.remove') },
              ]} onChange={() => form.setFieldValue('scene_code', undefined)} />
            </Form.Item>
            <Form.Item name="scene_code" label={t('bulk.scene')} rules={[{ required: true }]}>
              <Select options={options} placeholder={t('bulk.scenePlaceholder')} onChange={(value) => {
                if (value === 'default') form.setFieldValue('is_visible', true)
              }} />
            </Form.Item>
            {operation === 'add' && (
              <>
                <Form.Item name="is_visible" label={t('bulk.visible')} valuePropName="checked"><Switch disabled={sceneCode === 'default'} /></Form.Item>
                <Form.Item name="sort_order" label={t('bulk.sortOrder')} rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
              </>
            )}
          </Form>
        </Space>
      </Modal>
    </>
  )
}
