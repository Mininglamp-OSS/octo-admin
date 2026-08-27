import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Space, Modal, Form, Input, Popconfirm, message, Tooltip } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryItem,
} from '../../api/skill'

interface Props {
  canWrite: boolean
}

export default function CategoryTab({ canWrite }: Props) {
  const { t } = useTranslation('systemSkill')
  const [data, setData] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<CategoryItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listCategories()
      setData(list || [])
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  const openCreate = () => {
    if (!canWrite) return
    setEditItem(null)
    setModalOpen(true)
  }

  const openEdit = (item: CategoryItem) => {
    if (!canWrite) return
    setEditItem(item)
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!canWrite) return
    const values = await form.validateFields() as { name: string }
    setSubmitting(true)
    try {
      if (editItem) {
        await updateCategory(editItem.id, {
          ...values,
          // Echo the existing icon_key AND sort_order — this tab has no
          // sort_order field, so omitting it would zero the category's order on
          // the backend's full-replace PATCH (rename must not reorder).
          icon_key: editItem.icon_key,
          sort_order: editItem.sort_order,
          // Echo the row's plugin_types so a rename never narrows a category
          // shared across plugin types down to ["skill"].
          plugin_types: editItem.plugin_types,
        })
        message.success(t('category.success.updated'))
      } else {
        await createCategory({ ...values, icon_key: 'MoreHorizontal' })
        message.success(t('category.success.created'))
      }
      setModalOpen(false)
      fetchList()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!canWrite) return
    try {
      await deleteCategory(id)
      message.success(t('category.success.deleted'))
      fetchList()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const handleMove = async (index: number, direction: -1 | 1) => {
    if (!canWrite) return
    const target = index + direction
    if (target < 0 || target >= data.length) return
    const next = [...data]
    ;[next[index], next[target]] = [next[target], next[index]]
    setData(next)
    try {
      const moved = next[target]
      const swapped = next[index]
      await Promise.all([
        updateCategory(swapped.id, {
          name: swapped.name,
          icon_key: swapped.icon_key,
          sort_order: index,
          plugin_types: swapped.plugin_types,
        }),
        updateCategory(moved.id, {
          name: moved.name,
          icon_key: moved.icon_key,
          sort_order: target,
          plugin_types: moved.plugin_types,
        }),
      ])
      fetchList()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
      fetchList()
    }
  }

  const columns: ColumnsType<CategoryItem> = [
    {
      title: t('category.column.name'),
      dataIndex: 'name',
    },
    {
      title: t('category.column.skillCount'),
      dataIndex: 'skill_count',
      width: 120,
    },
    ...(canWrite
      ? [
          {
            title: t('category.column.action'),
            key: 'action',
            width: 200,
            render: (_: unknown, record: CategoryItem, index: number) => (
              <Space size="small">
                <a
                  onClick={() => handleMove(index, -1)}
                  style={{ opacity: index === 0 ? 0.3 : 1, pointerEvents: index === 0 ? 'none' : 'auto' }}
                >
                  ↑
                </a>
                <a
                  onClick={() => handleMove(index, 1)}
                  style={{ opacity: index === data.length - 1 ? 0.3 : 1, pointerEvents: index === data.length - 1 ? 'none' : 'auto' }}
                >
                  ↓
                </a>
                <a onClick={() => openEdit(record)}>{t('action.edit')}</a>
                {record.skill_count > 0 ? (
                  <Tooltip title={t('category.deleteDisabled')}>
                    <span style={{ color: 'var(--ant-color-text-disabled, #ccc)', cursor: 'not-allowed' }}>
                      {t('action.delete')}
                    </span>
                  </Tooltip>
                ) : (
                  <Popconfirm
                    title={t('category.deleteConfirm')}
                    onConfirm={() => handleDelete(record.id)}
                  >
                    <a style={{ color: 'var(--ant-color-error, #ff4d4f)' }}>{t('action.delete')}</a>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span />
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t('category.create')}
          </Button>
        )}
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        size="middle"
      />

      <Modal
        title={editItem ? t('category.editTitle') : t('category.createTitle')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{ name: editItem?.name ?? '' }}
        >
          <Form.Item
            name="name"
            label={t('category.form.name')}
            rules={[{ required: true }]}
          >
            <Input placeholder={t('category.form.namePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
