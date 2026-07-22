import { useState, useEffect, useRef } from 'react'
import { Modal, Upload, Button, Form, Input, Select, Space, message, Progress, Alert, Typography } from 'antd'
import { UploadOutlined, InboxOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  uploadInit,
  initReupload,
  uploadToPresigned,
  triggerParse,
  getParseStatus,
  createSkill,
  updateSkill,
  commitAdminSkillReupload,
  uploadIcon,
  listCategories,
  type SkillDetail,
  type ParseTaskStatus,
  type CategoryItem,
} from '../../api/skill'

interface Props {
  open: boolean
  editSkill?: SkillDetail | null
  onClose: () => void
  onSuccess: () => void
  canWrite: boolean
}

const MAX_SKILL_PACKAGE_SIZE = 20 * 1024 * 1024
const DEFAULT_VERSION = '0.1.0'
const SKILL_PACKAGE_ACCEPT = '.zip,.skill'

function bumpPatch(version: string): string {
  const parts = version.split('.')
  if (parts.length < 3) return version || DEFAULT_VERSION
  const patch = Number.parseInt(parts[2], 10)
  parts[2] = String(Number.isNaN(patch) ? 1 : patch + 1)
  return parts.join('.')
}

function validateSkillPackage(file: File, t: (key: string) => string): string | null {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.zip') && !name.endsWith('.skill')) return t('upload.invalidFormat')
  if (file.size > MAX_SKILL_PACKAGE_SIZE) return t('upload.fileTooLarge')
  return null
}

export default function SkillFormModal({ open, editSkill, onClose, onSuccess, canWrite }: Props) {
  const { t } = useTranslation('systemSkill')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [parseStatus, setParseStatus] = useState<ParseTaskStatus | null>(null)
  const [parseTaskId, setParseTaskId] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [reuploadedFileName, setReuploadedFileName] = useState('')
  const [renderEditSkill, setRenderEditSkill] = useState<SkillDetail | null>(null)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [iconUrl, setIconUrl] = useState('')
  const [iconUploading, setIconUploading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const [form] = Form.useForm()

  // Ensure polling stops on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (open) {
      listCategories().then(setCategories).catch(() => {})
      form.resetFields()
      if (editSkill) {
        setRenderEditSkill(editSkill)
        form.setFieldsValue({
          name: editSkill.name,
          display_name: editSkill.display_name,
          description: editSkill.description,
          category_id: editSkill.category_id,
          tags: editSkill.tags,
          visibility: 'public',
          version: editSkill.version,
          changelog: t('upload.currentVersionChangelog'),
        })
        setIconUrl(editSkill.icon_url || '')
      } else {
        setRenderEditSkill(null)
        form.setFieldsValue({ visibility: 'public', version: DEFAULT_VERSION, changelog: '' })
        setIconUrl('')
      }
      setParseTaskId('')
      setSelectedFileName('')
      setReuploadedFileName('')
      setParseStatus(null)
      setUploadProgress(0)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [open, editSkill, form])

  const activeEditSkill = editSkill ?? renderEditSkill

  const handleFileUpload = async (file: File) => {
    if (!canWrite) return
    const validationError = validateSkillPackage(file, t)
    if (validationError) {
      message.error(validationError)
      setParseStatus(null)
      setUploadProgress(0)
      return
    }
    setUploading(true)
    setUploadProgress(0)
    setParseTaskId('')
    setSelectedFileName(file.name)
    setParseStatus(null)
    try {
      const { upload_id, presigned_url, headers } = activeEditSkill
        ? await initReupload(activeEditSkill.id, file.name, file.size)
        : await uploadInit(file.name, file.size)

      await uploadToPresigned(presigned_url, file, headers ?? {}, setUploadProgress)

      const { task_id } = await triggerParse(upload_id)
      setParseTaskId(task_id)

      // Poll parse status
      pollRef.current = setInterval(async () => {
        try {
          const status = await getParseStatus(task_id)
          setParseStatus(status)
          if (status.status === 'success') {
            clearInterval(pollRef.current!)
            setUploadProgress(100)
            setUploading(false)
            // Pre-fill form from parse results
            form.setFieldsValue({
              name: status.result_name,
              display_name: status.result_name,
              description: status.result_description,
              tags: status.result_tags || [],
              version: activeEditSkill ? bumpPatch(activeEditSkill.version || DEFAULT_VERSION) : (status.result_version || DEFAULT_VERSION),
              changelog: activeEditSkill ? '' : t('upload.initialChangelog'),
              visibility: 'public',
            })
            if (activeEditSkill) setReuploadedFileName(file.name)
          } else if (status.status === 'failed') {
            clearInterval(pollRef.current!)
            setUploading(false)
          }
        } catch {
          clearInterval(pollRef.current!)
          setUploading(false)
        }
      }, 2000)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
      setUploading(false)
    }
  }

  const handleIconUpload = async (file: File) => {
    if (!canWrite) return
    setIconUploading(true)
    try {
      const { object_key } = await uploadIcon(file)
      setIconUrl(object_key)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setIconUploading(false)
    }
  }

  const handleSubmit = async () => {
    if (!canWrite) return
    const values = await form.validateFields()
    if (!activeEditSkill && !parseTaskId) {
      message.error(t('upload.noParsedFile'))
      return
    }
    setSubmitting(true)
    try {
      if (activeEditSkill) {
        if (parseTaskId) {
          await commitAdminSkillReupload(activeEditSkill.id, {
            parse_task_id: parseTaskId,
            version: values.version,
            changelog: values.changelog,
            tags: values.tags,
          })
        }
        await updateSkill(activeEditSkill.id, {
          name: values.name,
          display_name: values.display_name,
          description: values.description,
          category_id: values.category_id,
          tags: values.tags,
          visibility: 'public',
          icon_url: iconUrl || undefined,
        })
        message.success(t('editModal.success'))
      } else {
        await createSkill({
          parse_task_id: parseTaskId,
          name: values.name,
          display_name: values.display_name || values.name,
          description: values.description,
          category_id: values.category_id,
          tags: values.tags || [],
          visibility: 'public',
          version: values.version,
          changelog: values.changelog,
          icon_url: iconUrl || undefined,
        })
        message.success(t('upload.success'))
      }
      onSuccess()
      onClose()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const modalTitle = activeEditSkill ? t('editModal.title') : t('upload.title')

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnClose
      forceRender
      afterOpenChange={(isOpen) => {
        if (!isOpen && !editSkill) setRenderEditSkill(null)
      }}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          {t('confirm.delete.cancel')}
        </Button>,
        <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit}>
          {activeEditSkill ? t('action.edit') : t('upload.submit')}
        </Button>,
      ]}
    >
      <div>
        {!activeEditSkill ? (
          <div style={{ marginBottom: 20 }}>
            <Upload.Dragger
              accept={SKILL_PACKAGE_ACCEPT}
              showUploadList={false}
              beforeUpload={(file) => {
                handleFileUpload(file as File)
                return false
              }}
              disabled={uploading}
              style={{ padding: '8px 0' }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">
                {selectedFileName || t('upload.selectFile')}
              </p>
              <p className="ant-upload-hint">
                {parseTaskId
                  ? t('upload.parsedWithName', { name: form.getFieldValue('name') || selectedFileName })
                  : t('upload.selectFileHint')}
              </p>
            </Upload.Dragger>

            {uploading && (
              <div style={{ marginTop: 12 }}>
                <Progress percent={uploadProgress} status="active" />
                <div style={{ textAlign: 'center', marginTop: 6, color: '#999' }}>
                  {uploadProgress < 100 ? t('upload.uploading') : t('upload.parsing')}
                </div>
              </div>
            )}

            {parseStatus?.status === 'failed' && (
              <Alert
                type="error"
                message={t('upload.parseFailed')}
                description={parseStatus.error_message}
                style={{ marginTop: 12 }}
              />
            )}
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <Upload.Dragger
              accept={SKILL_PACKAGE_ACCEPT}
              showUploadList={false}
              beforeUpload={(file) => {
                handleFileUpload(file as File)
                return false
              }}
              disabled={uploading}
              style={{ padding: '8px 0' }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">
                {reuploadedFileName || activeEditSkill.file_name || t('upload.selectFile')}
              </p>
              <p className="ant-upload-hint">
                {reuploadedFileName
                  ? t('upload.newVersionParsedWithName', { name: form.getFieldValue('name') || reuploadedFileName })
                  : t('upload.currentPackageWithName', { name: activeEditSkill.name })}
              </p>
            </Upload.Dragger>

            {uploading && (
              <div style={{ marginTop: 12 }}>
                <Progress percent={uploadProgress} status="active" />
                <div style={{ textAlign: 'center', marginTop: 6, color: '#999' }}>
                  {uploadProgress < 100 ? t('upload.uploading') : t('upload.parsing')}
                </div>
              </div>
            )}

            {parseStatus?.status === 'failed' && (
              <Alert
                type="error"
                message={t('upload.parseFailed')}
                description={parseStatus.error_message}
                style={{ marginTop: 12 }}
              />
            )}
          </div>
        )}

        <Form form={form} layout="vertical">
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {t('upload.versionSection')}
          </Typography.Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="version" label={t('upload.form.version')} rules={[{ required: true }]}>
              <Input placeholder={DEFAULT_VERSION} disabled={!!activeEditSkill && !parseTaskId} />
            </Form.Item>
            <Form.Item name="changelog" label={t('upload.form.changelog')} rules={[{ required: !activeEditSkill || !!parseTaskId }]}>
              <Input placeholder={t('upload.form.changelogPlaceholder')} disabled={!!activeEditSkill && !parseTaskId} />
            </Form.Item>
          </div>

          <Typography.Title level={5} style={{ marginTop: 4 }}>
            {t('upload.basicInfoSection')}
          </Typography.Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {activeEditSkill ? (
              <Form.Item name="name" hidden rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            ) : (
              <Form.Item name="name" label={t('upload.form.name')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            )}
            <Form.Item name="display_name" label={t('upload.form.displayName')} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="category_id" label={t('upload.form.category')} rules={[{ required: true }]}>
              <Select
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                allowClear
              />
            </Form.Item>
            {!activeEditSkill && (
              <Form.Item name="visibility" label={t('upload.form.visibility')} initialValue="public">
                <Select
                  disabled
                  options={[
                    { value: 'public', label: t('visibility.public') },
                  ]}
                />
              </Form.Item>
            )}
          </div>
          <Form.Item name="description" label={t('upload.form.description')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="tags" label={t('upload.form.tags')}>
            <Select
              mode="tags"
              placeholder={t('upload.form.tagsPlaceholder')}
              options={[]}
            />
          </Form.Item>
            <Form.Item label={t('upload.form.icon')}>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  handleIconUpload(file as File)
                  return false
                }}
              >
                <Space>
                  {iconUrl && (
                    <img src={iconUrl} alt="icon" style={{ width: 32, height: 32, borderRadius: 4 }} />
                  )}
                  <Button icon={<UploadOutlined />} loading={iconUploading}>
                    {t('upload.form.uploadIcon')}
                  </Button>
                </Space>
              </Upload>
            </Form.Item>
          </Form>
      </div>
    </Modal>
  )
}
