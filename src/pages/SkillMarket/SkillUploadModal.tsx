import { useState } from 'react'
import { Form, Input, message, Modal, Select, Upload } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { UploadFile } from 'antd'
import {
  uploadAndParseSkillZip,
  createAdminSkill,
  type CategoryItem,
} from '../../api/skill'
import { ApiError } from '../../api'

const { Dragger } = Upload

interface Props {
  open: boolean
  categories: CategoryItem[]
  onClose: () => void
  onSuccess: () => void
}

export default function SkillUploadModal({ open, categories, onClose, onSuccess }: Props) {
  const { t } = useTranslation(['skillMarket'])
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (fileList.length === 0) {
        message.error(t('skill.uploadModal.zipRequired'))
        return
      }
      setSubmitting(true)

      const file = fileList[0].originFileObj as File

      // Presigned upload → parse → get parse_task_id
      const { parseTaskId } = await uploadAndParseSkillZip(file)

      // Create skill with parse_task_id and user-provided metadata
      await createAdminSkill({
        parse_task_id: parseTaskId,
        name: values.name || undefined,
        description: values.description || undefined,
        category_id: values.category_id || undefined,
        tags: values.tags?.length ? values.tags : undefined,
        version: values.version || undefined,
      })

      message.success(t('skill.uploadModal.success'))
      setFileList([])
      form.resetFields()
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError) {
        message.error(err.message || t('skill.uploadModal.failed'))
      } else {
        message.error((err as Error).message || t('skill.uploadModal.failed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('skill.uploadModal.title')}
      onCancel={() => {
        setFileList([])
        form.resetFields()
        onClose()
      }}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText={t('skill.uploadModal.submit')}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="name"
          label={t('skill.uploadModal.name')}
          rules={[{ required: true, message: t('skill.uploadModal.nameRequired') }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="description" label={t('skill.uploadModal.description')}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="category_id" label={t('skill.uploadModal.category')}>
          <Select allowClear placeholder={t('skill.categoryAll')}>
            {categories.map((c) => (
              <Select.Option key={c.skill_category_id} value={c.skill_category_id}>
                {c.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="tags" label={t('skill.uploadModal.tags')}>
          <Select mode="tags" placeholder={t('skill.uploadModal.tagsHint')} />
        </Form.Item>
        <Form.Item name="version" label={t('skill.uploadModal.version')}>
          <Input placeholder={t('skill.uploadModal.versionDefault')} />
        </Form.Item>
        <Form.Item label={t('skill.uploadModal.zipFile')} required>
          <Dragger
            accept=".zip"
            maxCount={1}
            fileList={fileList}
            onChange={({ fileList: newList }) => setFileList(newList)}
            beforeUpload={() => false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-hint">{t('skill.uploadModal.zipHint')}</p>
          </Dragger>
        </Form.Item>
      </Form>
    </Modal>
  )
}
