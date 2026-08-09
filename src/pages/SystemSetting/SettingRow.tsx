import type { TFunction } from 'i18next'
import { Button, Form, Input, InputNumber, Switch, Tooltip } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import type { SystemSettingItem } from '../../api/system-setting'
import {
  normaliseBoolValue,
  settingFormName,
  settingLabel,
  settingSummary,
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

  if (item.value_type === 'int') {
    // The number box is narrow, so the long "follow default (current: …)" copy
    // would be clipped — show just "default 60" instead.
    const placeholder = item.configured
      ? undefined
      : item.effective_value
        ? t('input.defaultValue', { value: item.effective_value })
        : t('input.followDefaultShort')

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

  // Show the effective default as a placeholder only when the field is unset.
  const placeholder = item.configured
    ? undefined
    : item.effective_value
      ? t('input.followDefaultWithCurrent', { value: item.effective_value })
      : t('input.followDefault')

  return (
    <Form.Item name={name} noStyle>
      <Input allowClear aria-label={ariaLabel} placeholder={placeholder} />
    </Form.Item>
  )
}

interface SettingRowProps {
  item: SystemSettingItem
  t: TFunction
  /** Has an unsaved edit — takes precedence over the "overridden" marker. */
  changed?: boolean
  /** Suppressed inside the "overridden" group, where every row is overridden. */
  showOverriddenBadge?: boolean
}

export default function SettingRow({
  item,
  t,
  changed = false,
  showOverriddenBadge = true,
}: SettingRowProps) {
  const name = settingFormName(item.category, item.key)
  const summary = settingSummary(item)
  const description = (item.description || '').trim()
  // The title gets clipped two independent ways: sentence extraction, and CSS
  // ellipsis on a long single-sentence description. The ⓘ hints at the first
  // (the only one detectable without measuring), but the tooltip covers both and
  // hangs off the whole title, which is focusable so the text is reachable
  // without a pointer.
  const hasMoreDetail = description !== '' && description !== summary

  const marker = changed
    ? ' setting-row--changed'
    : item.configured
      ? ' setting-row--overridden'
      : ''

  return (
    <div className={`setting-row${marker}`}>
      <div className="setting-row-text">
        <div className="setting-row-head">
          <Tooltip title={description || undefined} trigger={['hover', 'focus']}>
            <span className="setting-row-title" tabIndex={description ? 0 : undefined}>
              <span className="setting-row-label">{summary}</span>
              {/* Decorative: the tooltip lives on the parent, and the control's
                  aria-label already carries the full description. */}
              {hasMoreDetail && <InfoCircleOutlined className="setting-row-info" aria-hidden />}
            </span>
          </Tooltip>
          {changed ? (
            <Tooltip title={t('tooltip.changed')}>
              <span className="setting-badge setting-badge--changed">{t('badge.changed')}</span>
            </Tooltip>
          ) : (
            item.configured && showOverriddenBadge && (
              <Tooltip title={t('tooltip.overridden')}>
                <span className="setting-badge setting-badge--db">{t('badge.overridden')}</span>
              </Tooltip>
            )
          )}
        </div>
        <code className="setting-row-key">{name}</code>
      </div>
      <div className="setting-row-control">{renderControl(item, t)}</div>
    </div>
  )
}
