import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Tooltip,
  message,
} from 'antd'
import {
  ReloadOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  getSystemSettings,
  testSystemSettingEmail,
  updateSystemSettings,
  type SystemSettingItem,
} from '../../api/system-setting'
import SettingRow from './SettingRow'
import {
  categoryTitle,
  valuesFromSettings,
  valuesToPayload,
  type SystemSettingFormValues,
} from './helpers'

interface TestEmailFormValues {
  to: string
}

export default function SystemSetting() {
  const { t } = useTranslation(['systemSetting', 'common'])
  const [form] = Form.useForm<SystemSettingFormValues>()
  const [testForm] = Form.useForm<TestEmailFormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [settings, setSettings] = useState<SystemSettingItem[]>([])
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const settingGroups = useMemo(() => {
    const groups = new Map<string, SystemSettingItem[]>()
    settings.forEach((item) => {
      const group = groups.get(item.category) || []
      group.push(item)
      groups.set(item.category, group)
    })

    return Array.from(groups.entries())
  }, [settings])

  // keepSavedHint is set by the post-save reload so the "saved at" hint stays;
  // a manual refresh clears it to avoid implying the page was just saved.
  const fetchSettings = async (options?: { keepSavedHint?: boolean }) => {
    setLoading(true)
    try {
      const data = await getSystemSettings()
      const items = data.items || []
      setSettings(items)
      form.setFieldsValue(valuesFromSettings(items))
      setDirty(false)
      if (!options?.keepSavedHint) setSavedAt(null)
    } catch (error) {
      message.error(t('toast.fetchFailed', { message: (error as Error).message }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await updateSystemSettings(valuesToPayload(values, settings))
      message.success(t('toast.saved'))
      setSavedAt(dayjs().format('HH:mm'))
      await fetchSettings({ keepSavedHint: true })
    } catch (error) {
      message.error(t('toast.saveFailed', { message: (error as Error).message }))
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    const values = await testForm.validateFields()
    setTesting(true)
    try {
      await testSystemSettingEmail(values.to)
      message.success(t('toast.testSent'))
      setTestModalOpen(false)
      testForm.resetFields()
    } catch (error) {
      message.error(t('toast.testFailed', { message: (error as Error).message }))
    } finally {
      setTesting(false)
    }
  }

  const testEmailButton = (
    <Tooltip title={dirty ? t('tooltip.saveBeforeTest') : ''}>
      <Button
        size="small"
        icon={<SendOutlined />}
        onClick={() => setTestModalOpen(true)}
        disabled={dirty}
      >
        {t('action.testEmail')}
      </Button>
    </Tooltip>
  )

  // Per-category card-header actions; extend here when another category needs one.
  const categoryActions: Record<string, ReactNode> = {
    support: testEmailButton,
  }

  return (
    <div>
      <h1 className="page-title">{t('title')}</h1>
      <p className="page-subtitle">{t('subtitle')}</p>

      <div className="toolbar">
        <Button icon={<ReloadOutlined />} onClick={() => fetchSettings()} loading={loading}>
          {t('common:action.refresh')}
        </Button>
        <div className="toolbar-spacer" />
        {savedAt && !dirty && (
          <span className="setting-saved-hint">{t('savedAt', { time: savedAt })}</span>
        )}
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          {t('action.save')}
        </Button>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{}}
        onValuesChange={() => setDirty(true)}
      >
        <div className="setting-masonry">
          {settingGroups.map(([category, items]) => (
            <Card
              className="setting-card"
              key={category}
              title={
                <span className="setting-card-title">
                  {categoryTitle(t, category)}
                  <span className="setting-card-count">{t('countItems', { count: items.length })}</span>
                </span>
              }
              extra={categoryActions[category]}
              loading={loading}
            >
              <div className="setting-rows">
                {items.map((item) => (
                  <SettingRow key={`${item.category}.${item.key}`} item={item} t={t} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </Form>

      <Modal
        title={t('test.title')}
        open={testModalOpen}
        onOk={handleTestEmail}
        onCancel={() => {
          setTestModalOpen(false)
          testForm.resetFields()
        }}
        okText={t('test.okText')}
        cancelText={t('test.cancelText')}
        confirmLoading={testing}
      >
        <Alert
          type="info"
          showIcon
          message={t('test.alert')}
          style={{ marginBottom: 16 }}
        />
        <Form form={testForm} layout="vertical">
          <Form.Item
            name="to"
            label={t('test.field.label')}
            rules={[
              { required: true, message: t('test.field.required') },
              { type: 'email', message: t('test.field.invalid') },
            ]}
          >
            <Input placeholder="admin@example.com" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
