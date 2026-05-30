import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Tooltip,
  message,
} from 'antd'
import {
  ReloadOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  SECRET_MASK,
  getSystemSettings,
  testSystemSettingEmail,
  updateSystemSettings,
  type SystemSettingItem,
  type SystemSettingUpdateItem,
} from '../../api/system-setting'

type BoolFormValue = '' | '0' | '1'
type SettingFormValue = string | number | null | undefined

type SystemSettingFormValues = Record<string, SettingFormValue>

interface TestEmailFormValues {
  to: string
}

const settingMapKey = (category: string, key: string) => `${category}.${key}`
const settingFormName = (category: string, key: string) => settingMapKey(category, key)

const categoryTitleKeys: Record<string, string> = {
  login: 'category.login',
  register: 'category.register',
  support: 'category.support',
}

function normaliseBoolValue(value: string): BoolFormValue {
  if (value === '1' || value === 'true' || value === 'TRUE') return '1'
  if (value === '0' || value === 'false' || value === 'FALSE') return '0'
  return ''
}

function boolText(t: TFunction, value: string | undefined) {
  const normalised = normaliseBoolValue(value ?? '')
  if (normalised === '1') return t('bool.yes')
  if (normalised === '0') return t('bool.no')
  return t('bool.unset')
}

function formValueToString(value: SettingFormValue) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function valuesToPayload(values: SystemSettingFormValues, items: SystemSettingItem[]): SystemSettingUpdateItem[] {
  return items.map((item) => {
    const value = formValueToString(values[settingFormName(item.category, item.key)])
    const keepEncryptedValue = item.value_type === 'encrypted' && !value && (item.configured || item.value === SECRET_MASK)

    return {
      category: item.category,
      key: item.key,
      value: keepEncryptedValue ? SECRET_MASK : value,
    }
  })
}

function valuesFromSettings(items: SystemSettingItem[]): SystemSettingFormValues {
  return items.reduce<SystemSettingFormValues>((values, item) => {
    const fieldName = settingFormName(item.category, item.key)
    values[fieldName] = item.value_type === 'encrypted' ? '' : item.value ?? ''
    if (item.value_type === 'bool') {
      values[fieldName] = normaliseBoolValue(formValueToString(values[fieldName]))
    }
    return values
  }, {})
}

function categoryTitle(t: TFunction, category: string) {
  const titleKey = categoryTitleKeys[category]
  return titleKey ? t(titleKey) : t('category.generic', { category })
}

function settingSource(t: TFunction, item: SystemSettingItem) {
  return item.configured ? t('source.db') : t('source.default')
}

function genericSettingExtra(t: TFunction, item: SystemSettingItem) {
  const identity = settingMapKey(item.category, item.key)
  if (!item.effective_value) return identity
  const source = settingSource(t, item)
  if (item.value_type === 'encrypted') {
    return t('extra.effectiveEncrypted', { identity, source })
  }
  if (item.value_type === 'bool') {
    return t('extra.effectiveValue', { identity, value: boolText(t, item.effective_value), source })
  }
  return t('extra.effectiveValue', { identity, value: item.effective_value, source })
}

function genericBoolDefaultLabel(t: TFunction, item: SystemSettingItem) {
  return item.effective_value
    ? t('input.boolDefaultWithCurrent', { value: boolText(t, item.effective_value) })
    : t('input.boolDefault')
}

function settingLabel(item: SystemSettingItem) {
  return item.description || item.key
}

function renderSettingInput(t: TFunction, item: SystemSettingItem) {
  if (item.value_type === 'bool') {
    return (
      <Select
        options={[
          { value: '', label: genericBoolDefaultLabel(t, item) },
          { value: '1', label: t('bool.yes') },
          { value: '0', label: t('bool.no') },
        ]}
      />
    )
  }

  if (item.value_type === 'encrypted') {
    return (
      <Input.Password
        allowClear
        autoComplete="new-password"
        placeholder={item.configured ? t('input.encryptedKeep') : t('input.encryptedDefault')}
      />
    )
  }

  return <Input allowClear type={item.value_type === 'int' ? 'number' : undefined} />
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

  const settingGroups = useMemo(() => {
    const groups = new Map<string, SystemSettingItem[]>()
    settings.forEach((item) => {
      const group = groups.get(item.category) || []
      group.push(item)
      groups.set(item.category, group)
    })

    return Array.from(groups.entries())
  }, [settings])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const data = await getSystemSettings()
      const items = data.items || []
      setSettings(items)
      form.setFieldsValue(valuesFromSettings(items))
      setDirty(false)
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
      await fetchSettings()
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

  return (
    <div>
      <h1 className="page-title">{t('title')}</h1>
      <p className="page-subtitle">{t('subtitle')}</p>

      <div className="toolbar">
        <Button icon={<ReloadOutlined />} onClick={fetchSettings} loading={loading}>
          {t('common:action.refresh')}
        </Button>
        <div className="toolbar-spacer" />
        <Tooltip title={dirty ? t('tooltip.saveBeforeTest') : ''}>
          <Button
            icon={<SendOutlined />}
            onClick={() => setTestModalOpen(true)}
            disabled={dirty}
          >
            {t('action.testEmail')}
          </Button>
        </Tooltip>
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
        <Row gutter={[16, 16]}>
          {settingGroups.map(([category, items]) => (
            <Col xs={24} lg={12} key={category}>
              <Card title={categoryTitle(t, category)} loading={loading}>
                {items.map((item) => (
                  <Form.Item
                    key={settingMapKey(item.category, item.key)}
                    name={settingFormName(item.category, item.key)}
                    label={settingLabel(item)}
                    extra={genericSettingExtra(t, item)}
                  >
                    {renderSettingInput(t, item)}
                  </Form.Item>
                ))}
              </Card>
            </Col>
          ))}
        </Row>
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
