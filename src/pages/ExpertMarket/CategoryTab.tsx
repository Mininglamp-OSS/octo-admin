import { useCallback, useEffect, useState } from 'react'
import { Button, Form, Input, InputNumber, message, Modal, Popconfirm, Space, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import {
  createExpertCategory,
  deleteExpertCategory,
  listExpertCategories,
  updateExpertCategory,
  type ExpertCategory,
} from '../../api/expert'
import { ApiError } from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'

export default function CategoryTab() {
  const { t } = useTranslation(['expertMarket', 'common'])
  const canWrite = useAuthStore((s) => hasManagerCapability(s.managerCapabilities, 'expert.write'))

  const [rows, setRows] = useState<ExpertCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ExpertCategory | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listExpertCategories())
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ name: '', sort_order: 0 })
    setModalOpen(true)
  }

  const openEdit = (record: ExpertCategory) => {
    setEditing(record)
    form.setFieldsValue({ name: record.name, sort_order: record.sort_order })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      if (editing) {
        // AdminCategoryRequest decodes a missing icon_key as "" and the
        // backend overwrites all columns — echo the current icon_key back so
        // renames/re-sorts don't wipe the seeded lucide icon.
        await updateExpertCategory(editing.expert_category_id, {
          name: values.name,
          icon_key: editing.icon_key,
          sort_order: values.sort_order ?? 0,
        })
        message.success(t('category.success.updated'))
      } else {
        await createExpertCategory({ name: values.name, sort_order: values.sort_order ?? 0 })
        message.success(t('category.success.created'))
      }
      setModalOpen(false)
      load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        message.error(t('category.error.nameExists'))
      } else {
        message.error(
          editing ? t('category.error.updateFailed') : t('category.error.createFailed')
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (record: ExpertCategory) => {
    try {
      await deleteExpertCategory(record.expert_category_id)
      message.success(t('category.success.deleted'))
      load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const count = (err.details?.count as number) ?? 0
        message.error(t('category.deleteInUse', { count }))
      } else {
        message.error(t('category.error.deleteFailed'))
      }
    }
  }

  const columns: ColumnsType<ExpertCategory> = [
    { title: t('category.table.name'), dataIndex: 'name', key: 'name' },
    { title: t('category.table.count'), dataIndex: 'count', key: 'count', width: 100, render: (v?: number) => v ?? 0 },
    { title: t('category.table.sortOrder'), dataIndex: 'sort_order', key: 'sort_order', width: 100 },
    {
      title: t('category.table.actions'),
      key: 'actions',
      width: 180,
      render: (_, record) =>
        canWrite ? (
          <Space size="small">
            <Button type="link" size="small" onClick={() => openEdit(record)}>
              {t('category.rename')}
            </Button>
            <Popconfirm
              title={t('category.deleteConfirm')}
              onConfirm={() => handleDelete(record)}
              okText={t('common:action.confirm')}
              cancelText={t('common:action.cancel')}
            >
              <Button type="link" size="small" danger>
                {t('category.delete')}
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ]

  return (
    <div>
      {canWrite && (
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t('category.create')}
          </Button>
        </div>
      )}
      <Table
        rowKey="expert_category_id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        locale={{ emptyText: t('category.empty') }}
      />
      <Modal
        open={modalOpen}
        title={editing ? t('category.modal.editTitle') : t('category.modal.createTitle')}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label={t('category.modal.name')}
            rules={[{ required: true, message: t('category.modal.nameRequired') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="sort_order"
            label={t('category.modal.sortOrder')}
            tooltip={t('category.modal.sortOrderHint')}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
