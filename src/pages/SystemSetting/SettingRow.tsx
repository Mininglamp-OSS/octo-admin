import type { TFunction } from 'i18next'
import { Button, Form, Input, InputNumber, Switch } from 'antd'
import type { SystemSettingItem } from '../../api/system-setting'
import {
  normaliseBoolValue,
  settingFormName,
  settingLabel,
  type BoolFormValue,
} from './helpers'

interface BoolSwitchProps {
  item: SystemSettingItem
  t: TFunction
  // value / onChange 由外层 Form.Item 注入
  value?: BoolFormValue
  onChange?: (value: BoolFormValue) => void
}

/**
 * 三态布尔控件：Switch 负责 是/否，未显式配置时跟随默认值（form value 为空串）。
 * 一旦显式拨动，出现「恢复默认」链接，可把值清回空串以继续跟随默认。
 */
function BoolSwitch({ item, t, value, onChange }: BoolSwitchProps) {
  const isDefault = !value
  const effectiveOn = normaliseBoolValue(item.effective_value) === '1'
  const checked = isDefault ? effectiveOn : value === '1'

  return (
    <div className="setting-switch">
      {!isDefault && (
        <Button
          type="link"
          size="small"
          className="setting-switch-reset"
          onClick={() => onChange?.('')}
        >
          {t('action.followDefault')}
        </Button>
      )}
      <Switch checked={checked} onChange={(next) => onChange?.(next ? '1' : '0')} />
    </div>
  )
}

function renderControl(item: SystemSettingItem, t: TFunction) {
  const name = settingFormName(item.category, item.key)

  if (item.value_type === 'bool') {
    return (
      <Form.Item name={name} noStyle>
        <BoolSwitch item={item} t={t} />
      </Form.Item>
    )
  }

  if (item.value_type === 'encrypted') {
    return (
      <Form.Item name={name} noStyle>
        <Input.Password
          allowClear
          autoComplete="new-password"
          placeholder={item.configured ? t('input.encryptedKeep') : t('input.encryptedDefault')}
        />
      </Form.Item>
    )
  }

  if (item.value_type === 'int') {
    const placeholder = item.configured
      ? undefined
      : item.effective_value
        ? t('input.followDefaultWithCurrent', { value: item.effective_value })
        : t('input.followDefault')
    return (
      <Form.Item name={name} noStyle>
        <InputNumber className="setting-number" controls placeholder={placeholder} />
      </Form.Item>
    )
  }

  const placeholder = item.configured
    ? undefined
    : item.effective_value
      ? t('input.followDefaultWithCurrent', { value: item.effective_value })
      : t('input.followDefault')
  return (
    <Form.Item name={name} noStyle>
      <Input allowClear placeholder={placeholder} />
    </Form.Item>
  )
}

interface SettingRowProps {
  item: SystemSettingItem
  t: TFunction
}

export default function SettingRow({ item, t }: SettingRowProps) {
  // bool / int 控件紧凑，行内右对齐；string / encrypted 较宽，标签在上、控件整行
  const inline = item.value_type === 'bool' || item.value_type === 'int'
  const badgeKey = item.configured ? 'badge.db' : 'badge.default'
  const badgeClass = item.configured ? 'setting-badge--db' : 'setting-badge--default'

  return (
    <div className={`setting-row ${inline ? 'setting-row--inline' : 'setting-row--block'}`}>
      <div className="setting-row-text">
        <div className="setting-row-head">
          <span className="setting-row-label">{settingLabel(item)}</span>
          <span className={`setting-badge ${badgeClass}`}>{t(badgeKey)}</span>
        </div>
        <code className="setting-row-key">{settingFormName(item.category, item.key)}</code>
      </div>
      <div className="setting-row-control">{renderControl(item, t)}</div>
    </div>
  )
}
