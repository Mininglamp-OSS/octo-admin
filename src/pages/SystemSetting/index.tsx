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
  Space,
  Tag,
  Tooltip,
  message,
} from 'antd'
import {
  MailOutlined,
  ReloadOutlined,
  SaveOutlined,
  SendOutlined,
  UserAddOutlined,
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

interface SystemSettingFormValues {
  register_off: BoolFormValue
  register_only_china: BoolFormValue
  register_username_on: BoolFormValue
  register_email_on: BoolFormValue
  support_email: string
  support_email_smtp: string
  support_email_pwd: string
}

interface TestEmailFormValues {
  to: string
}

interface BoolSettingDef {
  name: keyof SystemSettingFormValues
  category: 'register'
  key: 'off' | 'only_china' | 'username_on' | 'email_on'
  label: string
  description: string
  onLabel: string
  offLabel: string
}

const boolSettings: BoolSettingDef[] = [
  {
    name: 'register_off',
    category: 'register',
    key: 'off',
    label: '注册入口',
    description: '是否关闭注册',
    onLabel: '关闭注册',
    offLabel: '允许注册',
  },
  {
    name: 'register_only_china',
    category: 'register',
    key: 'only_china',
    label: '手机号范围',
    description: '仅中国手机号可以注册',
    onLabel: '仅中国手机号',
    offLabel: '不限制地区',
  },
  {
    name: 'register_username_on',
    category: 'register',
    key: 'username_on',
    label: '用户名注册',
    description: '是否开启用户名注册',
    onLabel: '开启',
    offLabel: '关闭',
  },
  {
    name: 'register_email_on',
    category: 'register',
    key: 'email_on',
    label: '邮箱注册/登录',
    description: '是否开启邮箱注册/登录',
    onLabel: '开启',
    offLabel: '关闭',
  },
]

const settingMapKey = (category: string, key: string) => `${category}.${key}`

const initialValues: SystemSettingFormValues = {
  register_off: '',
  register_only_china: '',
  register_username_on: '',
  register_email_on: '',
  support_email: '',
  support_email_smtp: '',
  support_email_pwd: '',
}

function getValue(items: SystemSettingItem[], category: string, key: string) {
  return items.find((item) => item.category === category && item.key === key)?.value ?? ''
}

function getSetting(items: SystemSettingItem[], category: string, key: string) {
  return items.find((item) => item.category === category && item.key === key)
}

function normaliseBoolValue(value: string): BoolFormValue {
  if (value === '1' || value === 'true' || value === 'TRUE') return '1'
  if (value === '0' || value === 'false' || value === 'FALSE') return '0'
  return ''
}

function boolText(value: string | undefined, item: BoolSettingDef) {
  const normalised = normaliseBoolValue(value ?? '')
  if (normalised === '1') return item.onLabel
  if (normalised === '0') return item.offLabel
  return '未配置'
}

function boolDefaultLabel(def: BoolSettingDef, item?: SystemSettingItem) {
  return item?.effective_value ? `跟随默认配置（当前：${boolText(item.effective_value, def)}）` : '跟随默认配置'
}

function stringExtra(description: string, item?: SystemSettingItem) {
  if (!item?.effective_value) return description
  const source = item.configured ? 'DB 配置' : '默认配置'
  return `${description}。当前生效：${item.effective_value}（${source}）`
}

function encryptedExtra(description: string, item?: SystemSettingItem) {
  if (!item?.effective_value) return description
  const source = item.configured ? 'DB 配置' : '默认配置'
  return `${description}。当前生效：已配置（${source}）`
}

function valuesToPayload(values: SystemSettingFormValues, keepExistingPassword: boolean): SystemSettingUpdateItem[] {
  const payload: SystemSettingUpdateItem[] = boolSettings.map((item) => ({
    category: item.category,
    key: item.key,
    value: values[item.name] || '',
  }))

  payload.push(
    {
      category: 'support',
      key: 'email',
      value: values.support_email ?? '',
    },
    {
      category: 'support',
      key: 'email_smtp',
      value: values.support_email_smtp ?? '',
    },
    {
      category: 'support',
      key: 'email_pwd',
      value: values.support_email_pwd || (keepExistingPassword ? SECRET_MASK : ''),
    },
  )

  return payload
}

export default function SystemSetting() {
  const [form] = Form.useForm<SystemSettingFormValues>()
  const [testForm] = Form.useForm<TestEmailFormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [settings, setSettings] = useState<SystemSettingItem[]>([])
  const [hasStoredPassword, setHasStoredPassword] = useState(false)
  const [hasEffectivePassword, setHasEffectivePassword] = useState(false)
  const [dirty, setDirty] = useState(false)

  const settingDescriptions = useMemo(() => {
    const map = new Map<string, string>()
    settings.forEach((item) => {
      map.set(settingMapKey(item.category, item.key), item.description)
    })
    return map
  }, [settings])

  const settingByKey = useMemo(() => {
    const map = new Map<string, SystemSettingItem>()
    settings.forEach((item) => {
      map.set(settingMapKey(item.category, item.key), item)
    })
    return map
  }, [settings])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const data = await getSystemSettings()
      const items = data.items || []
      const passwordSetting = getSetting(items, 'support', 'email_pwd')
      const storedPassword =
        passwordSetting?.configured === true || getValue(items, 'support', 'email_pwd') === SECRET_MASK
      const effectivePassword = passwordSetting?.effective_value === SECRET_MASK
      setSettings(items)
      setHasStoredPassword(storedPassword)
      setHasEffectivePassword(effectivePassword)
      form.setFieldsValue({
        register_off: normaliseBoolValue(getValue(items, 'register', 'off')),
        register_only_china: normaliseBoolValue(getValue(items, 'register', 'only_china')),
        register_username_on: normaliseBoolValue(getValue(items, 'register', 'username_on')),
        register_email_on: normaliseBoolValue(getValue(items, 'register', 'email_on')),
        support_email: getValue(items, 'support', 'email'),
        support_email_smtp: getValue(items, 'support', 'email_smtp'),
        support_email_pwd: '',
      })
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
      await updateSystemSettings(valuesToPayload(values, hasStoredPassword))
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
      <p className="page-subtitle">注册策略与邮件服务配置</p>

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
        initialValues={initialValues}
        onValuesChange={() => setDirty(true)}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="注册配置" loading={loading} extra={<UserAddOutlined style={{ color: 'var(--a-text-tertiary)' }} />}>
              {boolSettings.map((item) => (
                <Form.Item
                  key={item.name}
                  name={item.name}
                  label={item.label}
                  extra={settingDescriptions.get(settingMapKey(item.category, item.key)) || item.description}
                >
                  <Select
                    options={[
                      {
                        value: '',
                        label: boolDefaultLabel(item, settingByKey.get(settingMapKey(item.category, item.key))),
                      },
                      { value: '1', label: item.onLabel },
                      { value: '0', label: item.offLabel },
                    ]}
                  />
                </Form.Item>
              ))}
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card title="邮件服务" loading={loading} extra={<MailOutlined style={{ color: 'var(--a-text-tertiary)' }} />}>
              <Form.Item
                name="support_email"
                label="技术支持邮箱"
                extra={stringExtra(
                  settingDescriptions.get('support.email') || '技术支持邮箱（发件人）',
                  settingByKey.get('support.email'),
                )}
                rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
              >
                <Input allowClear placeholder="support@example.com" />
              </Form.Item>

              <Form.Item
                name="support_email_smtp"
                label="SMTP 服务器"
                extra={stringExtra(
                  settingDescriptions.get('support.email_smtp') || 'SMTP 服务器 host:port',
                  settingByKey.get('support.email_smtp'),
                )}
              >
                <Input allowClear placeholder="smtp.example.com:587" />
              </Form.Item>

              <Form.Item
                name="support_email_pwd"
                label={
                  <Space size={8}>
                    <span>SMTP 密码</span>
                    {hasStoredPassword ? (
                      <Tag color="processing">DB 已配置</Tag>
                    ) : hasEffectivePassword ? (
                      <Tag color="default">默认已配置</Tag>
                    ) : null}
                  </Space>
                }
                extra={encryptedExtra(
                  settingDescriptions.get('support.email_pwd') || 'SMTP 密码（加密存储）',
                  settingByKey.get('support.email_pwd'),
                )}
              >
                <Input.Password
                  allowClear
                  autoComplete="new-password"
                  placeholder={hasStoredPassword ? '留空保留现有密码' : '留空跟随默认配置'}
                />
              </Form.Item>
            </Card>
          </Col>
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
