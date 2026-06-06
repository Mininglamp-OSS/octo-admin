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
  // value / onChange are injected by the wrapping Form.Item
  value?: BoolFormValue
  onChange?: (value: BoolFormValue) => void
}

/**
 * Tri-state boolean control. The Switch toggles yes/no; while no explicit
 * value is set (form value is an empty string) the field follows the default.
 * Once toggled explicitly, a "reset to default" link appears so the value can
 * be cleared back to the empty string and keep following the default.
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
      <Switch
        // Muted while following the default, so it reads differently from an
        // explicitly-set value at a glance.
        className={isDefault ? 'setting-switch-toggle setting-switch-toggle--default' : 'setting-switch-toggle'}
        checked={checked}
        aria-label={settingLabel(item)}
        onChange={(next) => onChange?.(next ? '1' : '0')}
      />
    </div>
  )
}

function renderControl(item: SystemSettingItem, t: TFunction) {
  const name = settingFormName(item.category, item.key)
  const ariaLabel = settingLabel(item)

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
          aria-label={ariaLabel}
          placeholder={item.configured ? t('input.encryptedKeep') : t('input.encryptedDefault')}
        />
      </Form.Item>
    )
  }

  // Show the effective default as a placeholder only when the field is unset.
  const placeholder = item.configured
    ? undefined
    : item.effective_value
      ? t('input.followDefaultWithCurrent', { value: item.effective_value })
      : t('input.followDefault')

  if (item.value_type === 'int') {
    return (
      <Form.Item name={name} noStyle>
        <InputNumber
          className="setting-number"
          controls
          precision={0}
          aria-label={ariaLabel}
          placeholder={placeholder}
        />
      </Form.Item>
    )
  }

  return (
    <Form.Item name={name} noStyle>
      <Input allowClear aria-label={ariaLabel} placeholder={placeholder} />
    </Form.Item>
  )
}

interface SettingRowProps {
  item: SystemSettingItem
  t: TFunction
}

export default function SettingRow({ item, t }: SettingRowProps) {
  // bool / int controls are compact and sit inline on the right; string /
  // encrypted are wider, so the label stays on top and the control spans the row.
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
