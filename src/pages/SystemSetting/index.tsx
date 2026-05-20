import { useEffect, useMemo, useState } from 'react'
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

const categoryTitles: Record<string, string> = {
  login: '登录配置',
  register: '注册配置',
  support: '邮件服务',
}

function normaliseBoolValue(value: string): BoolFormValue {
  if (value === '1' || value === 'true' || value === 'TRUE') return '1'
  if (value === '0' || value === 'false' || value === 'FALSE') return '0'
  return ''
}

function boolText(value: string | undefined) {
  const normalised = normaliseBoolValue(value ?? '')
  if (normalised === '1') return '是'
  if (normalised === '0') return '否'
  return '未配置'
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

function categoryTitle(category: string) {
  return categoryTitles[category] || `${category} 配置`
}

function settingSource(item: SystemSettingItem) {
  return item.configured ? 'DB 配置' : '默认配置'
}

function genericSettingExtra(item: SystemSettingItem) {
  const identity = settingMapKey(item.category, item.key)
  if (!item.effective_value) return identity
  if (item.value_type === 'encrypted') return `${identity}。当前生效：已配置（${settingSource(item)}）`
  if (item.value_type === 'bool') {
    return `${identity}。当前生效：${boolText(item.effective_value)}（${settingSource(item)}）`
  }
  return `${identity}。当前生效：${item.effective_value}（${settingSource(item)}）`
}

function genericBoolDefaultLabel(item: SystemSettingItem) {
  return item.effective_value ? `跟随默认配置（当前：${boolText(item.effective_value)}）` : '跟随默认配置'
}

function settingLabel(item: SystemSettingItem) {
  return item.description || item.key
}

function renderSettingInput(item: SystemSettingItem) {
  if (item.value_type === 'bool') {
    return (
      <Select
        options={[
          { value: '', label: genericBoolDefaultLabel(item) },
          { value: '1', label: '是' },
          { value: '0', label: '否' },
        ]}
      />
    )
  }

  if (item.value_type === 'encrypted') {
    return (
      <Input.Password
        allowClear
        autoComplete="new-password"
        placeholder={item.configured ? '留空保留现有值' : '留空跟随默认配置'}
      />
    )
  }

  return <Input allowClear type={item.value_type === 'int' ? 'number' : undefined} />
}

export default function SystemSetting() {
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
      message.error('获取系统配置失败: ' + (error as Error).message)
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
      message.success('配置已保存')
      await fetchSettings()
    } catch (error) {
      message.error('保存失败: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    const values = await testForm.validateFields()
    setTesting(true)
    try {
      await testSystemSettingEmail(values.to)
      message.success('测试邮件已发送')
      setTestModalOpen(false)
      testForm.resetFields()
    } catch (error) {
      message.error('发送失败: ' + (error as Error).message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <h1 className="page-title">系统配置</h1>
      <p className="page-subtitle">登录、注册策略与邮件服务配置</p>

      <div className="toolbar">
        <Button icon={<ReloadOutlined />} onClick={fetchSettings} loading={loading}>
          刷新
        </Button>
        <div className="toolbar-spacer" />
        <Tooltip title={dirty ? '请先保存配置后再发送测试邮件' : ''}>
          <Button
            icon={<SendOutlined />}
            onClick={() => setTestModalOpen(true)}
            disabled={dirty}
          >
            测试邮件
          </Button>
        </Tooltip>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          保存配置
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
              <Card title={categoryTitle(category)} loading={loading}>
                {items.map((item) => (
                  <Form.Item
                    key={settingMapKey(item.category, item.key)}
                    name={settingFormName(item.category, item.key)}
                    label={settingLabel(item)}
                    extra={genericSettingExtra(item)}
                  >
                    {renderSettingInput(item)}
                  </Form.Item>
                ))}
              </Card>
            </Col>
          ))}
        </Row>
      </Form>

      <Modal
        title="发送测试邮件"
        open={testModalOpen}
        onOk={handleTestEmail}
        onCancel={() => {
          setTestModalOpen(false)
          testForm.resetFields()
        }}
        okText="发送"
        cancelText="取消"
        confirmLoading={testing}
      >
        <Alert
          type="info"
          showIcon
          message="测试邮件将使用当前已保存的配置发送。如刚刚修改了配置，请先点击「保存配置」。"
          style={{ marginBottom: 16 }}
        />
        <Form form={testForm} layout="vertical">
          <Form.Item
            name="to"
            label="收件邮箱"
            rules={[
              { required: true, message: '请输入收件邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="admin@example.com" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
