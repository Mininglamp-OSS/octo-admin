import { useCallback, useEffect, useState } from 'react'
import { Button, Form, Input, InputNumber, message, Modal, Popconfirm, Space, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import {
  listSkillCategories,
  createSkillCategory,
  updateSkillCategory,
  deleteSkillCategory,
  type CategoryItem,
} from '../../api/skill'
import { ApiError } from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'

export default function CategoryTab() {
  const { t } = useTranslation(['skillMarket', 'common'])
  const canWrite = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'skill.write')
  )

  const [rows, setRows] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryItem | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listSkillCategories()
      setRows(data)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('skill.loadFailed'))
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

  const openEdit = (record: CategoryItem) => {
    setEditing(record)
    form.setFieldsValue({ name: record.name, sort_order: record.sort_order })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editing) {
        await updateSkillCategory(editing.skill_category_id, {
          name: values.name,
          sort_order: values.sort_order ?? 0,
        })
        message.success(t('category.success.updated'))
      } else {
        await createSkillCategory({
          name: values.name,
          sort_order: values.sort_order ?? 0,
        })
        message.success(t('category.success.created'))
      }
      setModalOpen(false)
      load()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'CategoryAlreadyExists' || err.status === 409) {
          message.error(t('category.error.nameExists'))
        } else {
          message.error(editing ? t('category.error.updateFailed') : t('category.error.createFailed'))
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (record: CategoryItem) => {
    try {
      await deleteSkillCategory(record.skill_category_id)
      message.success(t('category.success.deleted'))
      load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const count = (err.details?.skill_count as number) ?? 0
        message.error(t('category.deleteInUse', { count }))
      } else {
        message.error(t('category.error.deleteFailed'))
      }
    }
  }

  const columns: ColumnsType<CategoryItem> = [
    {
      title: t('category.table.name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('category.table.sortOrder'),
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 100,
    },
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
              okText={t('common:confirm')}
              cancelText={t('common:cancel')}
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
        rowKey="skill_category_id"
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
