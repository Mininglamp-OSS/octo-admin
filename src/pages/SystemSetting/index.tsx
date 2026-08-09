import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Tooltip,
  message,
} from 'antd'
import {
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  getSystemSettings,
  testSystemSettingEmail,
  updateSystemSettings,
  type SystemSettingItem,
} from '../../api/system-setting'
import SettingRow from './SettingRow'
import CategoryNav, { CHANGED_KEY, OVERRIDDEN_KEY } from './CategoryNav'
import {
  categoryTitle,
  changedFieldNames,
  groupByCategory,
  matchesSettingQuery,
  settingFormName,
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
  const [changedFields, setChangedFields] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [activeKey, setActiveKey] = useState(OVERRIDDEN_KEY)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const dirty = changedFields.length > 0
  const trimmedQuery = query.trim()

  const categoryGroups = useMemo(() => groupByCategory(settings), [settings])
  const overriddenItems = useMemo(() => settings.filter((item) => item.configured), [settings])
  const changedSet = useMemo(() => new Set(changedFields), [changedFields])
  const changedItems = useMemo(
    () => settings.filter((item) => changedSet.has(settingFormName(item.category, item.key))),
    [settings, changedSet],
  )

  // Searching spans every category, so it replaces the selected category
  // rather than filtering within it.
  const visibleGroups = useMemo<[string, SystemSettingItem[]][]>(() => {
    if (trimmedQuery) {
      return groupByCategory(settings.filter((item) => matchesSettingQuery(item, trimmedQuery)))
    }
    if (activeKey === CHANGED_KEY) return [[CHANGED_KEY, changedItems]]
    if (activeKey === OVERRIDDEN_KEY) return [[OVERRIDDEN_KEY, overriddenItems]]
    return [[activeKey, settings.filter((item) => item.category === activeKey)]]
  }, [trimmedQuery, settings, activeKey, changedItems, overriddenItems])

  const matchCount = useMemo(
    () => visibleGroups.reduce((total, [, items]) => total + items.length, 0),
    [visibleGroups],
  )

  // Keep the selection valid: a virtual group disappears once it empties (e.g.
  // the last unsaved edit is reverted), and a refresh may drop a category.
  useEffect(() => {
    if (!settings.length) return
    const stillValid =
      activeKey === CHANGED_KEY
        ? changedItems.length > 0
        : activeKey === OVERRIDDEN_KEY
          ? overriddenItems.length > 0
          : settings.some((item) => item.category === activeKey)
    if (!stillValid) {
      setActiveKey(overriddenItems.length ? OVERRIDDEN_KEY : settings[0].category)
    }
  }, [settings, activeKey, changedItems.length, overriddenItems.length])

  // keepSavedHint is set by the post-save reload so the "saved at" hint stays;
  // a manual refresh clears it to avoid implying the page was just saved.
  const fetchSettings = async (options?: { keepSavedHint?: boolean }) => {
    setLoading(true)
    try {
      const data = await getSystemSettings()
      const items = data.items || []
      setSettings(items)
      form.setFieldsValue(valuesFromSettings(items))
      setChangedFields([])
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

  // getFieldsValue(true) reads the whole form store, not just the mounted
  // fields. Only one category is rendered at a time, so anything else would
  // report every other category as blank.
  const allValues = () => form.getFieldsValue(true) as SystemSettingFormValues

  const handleValuesChange = () => setChangedFields(changedFieldNames(allValues(), settings))

  const handleDiscard = () => {
    form.setFieldsValue(valuesFromSettings(settings))
    setChangedFields([])
  }

  const handleSave = async () => {
    await form.validateFields()
    setSaving(true)
    try {
      await updateSystemSettings(valuesToPayload(allValues(), settings))
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

  const groupTitle = (key: string) => {
    if (key === CHANGED_KEY) return t('group.changed')
    if (key === OVERRIDDEN_KEY) return t('group.overridden')
    return categoryTitle(t, key)
  }

  return (
    <div>
      <h1 className="page-title">{t('title')}</h1>
      <p className="page-subtitle">{t('subtitle')}</p>

      <div className="toolbar">
        <Input
          className="setting-search"
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="setting-stat">
          {t('stat.summary', { total: settings.length, overridden: overriddenItems.length })}
        </span>
        <div className="toolbar-spacer" />
        {savedAt && !dirty && (
          <span className="setting-saved-hint">{t('savedAt', { time: savedAt })}</span>
        )}
        <Button icon={<ReloadOutlined />} onClick={() => fetchSettings()} loading={loading}>
          {t('common:action.refresh')}
        </Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          {dirty ? t('action.saveWithCount', { count: changedFields.length }) : t('action.save')}
        </Button>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{}}
        onValuesChange={handleValuesChange}
      >
        <div className={`setting-layout${dirty ? ' setting-layout--with-save-bar' : ''}`}>
          <CategoryNav
            groups={categoryGroups}
            // Searching spans all categories, so nothing in the rail is "current".
            activeKey={trimmedQuery ? '' : activeKey}
            changedCount={changedFields.length}
            overriddenCount={overriddenItems.length}
            onSelect={(key) => {
              setQuery('')
              setActiveKey(key)
            }}
            t={t}
          />

          <div className="setting-panel">
            {trimmedQuery && (
              <div className="setting-hint">
                <span>{t('search.hint', { query: trimmedQuery, count: matchCount })}</span>
                <Button type="link" size="small" className="setting-hint-clear" onClick={() => setQuery('')}>
                  {t('search.clear')}
                </Button>
              </div>
            )}

            {matchCount === 0 && !loading ? (
              <Card className="setting-card">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={trimmedQuery ? t('search.empty') : t('group.empty')}
                />
              </Card>
            ) : (
              visibleGroups.map(([key, items]) => (
                <Card
                  className="setting-card"
                  key={key}
                  title={
                    <span className="setting-card-title">
                      {groupTitle(key)}
                      <span className="setting-card-count">{t('countItems', { count: items.length })}</span>
                    </span>
                  }
                  extra={categoryActions[key]}
                  loading={loading}
                >
                  <div className="setting-rows">
                    {items.map((item) => {
                      const name = settingFormName(item.category, item.key)
                      return (
                        <SettingRow
                          key={name}
                          item={item}
                          t={t}
                          changed={changedSet.has(name)}
                          showOverriddenBadge={key !== OVERRIDDEN_KEY}
                        />
                      )
                    })}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </Form>

      <div className={`setting-save-bar${dirty ? ' show' : ''}`}>
        <span className="setting-save-bar-text">
          {t('unsavedCount', { count: changedFields.length })}
        </span>
        <Button size="small" type="text" onClick={handleDiscard} disabled={saving}>
          {t('action.discard')}
        </Button>
        <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          {t('action.save')}
        </Button>
      </div>

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
