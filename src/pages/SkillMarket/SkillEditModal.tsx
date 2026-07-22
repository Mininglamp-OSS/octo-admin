import { useEffect, useState } from 'react'
import { Form, Input, message, Modal, Select } from 'antd'
import { useTranslation } from 'react-i18next'
import { updateAdminSkill, type CategoryItem, type SkillListItem } from '../../api/skill'
import { ApiError } from '../../api'

interface Props {
  open: boolean
  skill: SkillListItem | null
  categories: CategoryItem[]
  onClose: () => void
  onSuccess: () => void
}

export default function SkillEditModal({ open, skill, categories, onClose, onSuccess }: Props) {
  const { t } = useTranslation(['skillMarket'])
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && skill) {
      form.setFieldsValue({
        name: skill.name,
        description: skill.description,
        category_id: skill.category_id || undefined,
        tags: skill.tags ?? [],
        icon_url: skill.icon_url ?? '',
      })
    }
  }, [open, skill, form])

  const handleSubmit = async () => {
    if (!skill) return
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await updateAdminSkill(skill.skill_id, {
        name: values.name,
        description: values.description,
        category_id: values.category_id || undefined,
        tags: values.tags,
        icon_url: values.icon_url || undefined,
      })
      message.success(t('skill.editModal.success'))
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError) {
        message.error(err.message || t('skill.editModal.failed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('skill.editModal.title')}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText={t('skill.editModal.save')}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="name" label={t('skill.editModal.name')}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label={t('skill.editModal.description')}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="category_id" label={t('skill.editModal.category')}>
          <Select allowClear placeholder={t('skill.categoryAll')}>
            {categories.map((c) => (
              <Select.Option key={c.skill_category_id} value={c.skill_category_id}>
                {c.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="tags" label={t('skill.editModal.tags')}>
          <Select mode="tags" placeholder={t('skill.uploadModal.tagsHint')} />
        </Form.Item>
        <Form.Item name="icon_url" label={t('skill.editModal.icon')}>
          <Input placeholder="https://..." />
        </Form.Item>
      </Form>
    </Modal>
  )
}
