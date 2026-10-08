import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, InputNumber, message, Modal, Popconfirm, Space, Table, Tooltip } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  createPluginScene,
  deletePluginScene,
  listPluginScenes,
  updatePluginScene,
  type PluginScene,
} from '../../api/marketplace-scene'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'

interface SceneFormValues {
  scene_code: string
  name: string
  description: string
  sort_order: number
}

export default function SceneTab() {
  const { t } = useTranslation(['marketplaceScene', 'common'])
  const canWrite = useAuthStore((state) => hasManagerCapability(state.managerCapabilities, 'skill.write'))
  const [rows, setRows] = useState<PluginScene[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PluginScene | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<SceneFormValues>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listPluginScenes())
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : t('scene.error.load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({ scene_code: '', name: '', description: '', sort_order: 100 })
    setModalOpen(true)
  }

  const openEdit = (record: PluginScene) => {
    setEditing(record)
    form.setFieldsValue(record)
    setModalOpen(true)
  }

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editing) {
        await updatePluginScene(editing.scene_id, {
          name: values.name.trim(),
          description: values.description?.trim() ?? '',
          sort_order: values.sort_order ?? 0,
        })
        message.success(t('scene.success.updated'))
      } else {
        await createPluginScene({
          scene_code: values.scene_code.trim(),
          name: values.name.trim(),
          description: values.description?.trim() ?? '',
          sort_order: values.sort_order ?? 0,
        })
        message.success(t('scene.success.created'))
      }
      setModalOpen(false)
      await load()
    } catch (error) {
      if (error instanceof ApiError) message.error(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (record: PluginScene) => {
    try {
      await deletePluginScene(record.scene_id)
      message.success(t('scene.success.deleted'))
      await load()
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : t('scene.error.delete'))
    }
  }

  const columns: ColumnsType<PluginScene> = [
    { title: t('scene.table.name'), dataIndex: 'name' },
    { title: t('scene.table.code'), dataIndex: 'scene_code' },
    { title: t('scene.table.pluginCount'), dataIndex: 'plugin_count', width: 110 },
    { title: t('scene.table.categoryCount'), dataIndex: 'category_count', width: 110 },
    { title: t('scene.table.sortOrder'), dataIndex: 'sort_order', width: 90 },
    { title: t('scene.table.description'), dataIndex: 'description', ellipsis: true },
    {
      title: t('scene.table.actions'), key: 'actions', width: 150,
      render: (_, record) => canWrite ? (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(record)}>{t('scene.edit')}</Button>
          {record.scene_code === 'default' ? (
            <Tooltip title={t('scene.defaultProtected')}><Button type="link" size="small" danger disabled>{t('scene.delete')}</Button></Tooltip>
          ) : (
            <Popconfirm title={t('scene.deleteConfirm')} onConfirm={() => remove(record)}>
              <Button type="link" size="small" danger>{t('scene.delete')}</Button>
            </Popconfirm>
          )}
        </Space>
      ) : null,
    },
  ]

  return (
    <div>
      <Alert type="info" showIcon message={t('scene.scopeHint')} style={{ marginBottom: 16 }} />
      {canWrite && (
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ marginBottom: 16 }}>
          {t('scene.create')}
        </Button>
      )}
      <Table rowKey="scene_id" columns={columns} dataSource={rows} loading={loading} pagination={false} />
      <Modal open={modalOpen} title={editing ? t('scene.modal.edit') : t('scene.modal.create')} onCancel={() => setModalOpen(false)} onOk={submit} confirmLoading={submitting} destroyOnClose>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="scene_code" label={t('scene.field.code')} tooltip={t('scene.field.codeHint')} rules={[{ required: true }, { pattern: /^[a-z0-9][a-z0-9._-]{0,127}$/, message: t('scene.field.codeInvalid') }]}>
            <Input disabled={editing !== null} maxLength={128} />
          </Form.Item>
          <Form.Item name="name" label={t('scene.field.name')} rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
          <Form.Item name="description" label={t('scene.field.description')}><Input.TextArea maxLength={1024} showCount rows={3} /></Form.Item>
          <Form.Item name="sort_order" label={t('scene.field.sortOrder')} rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
