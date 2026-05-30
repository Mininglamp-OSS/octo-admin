import { Dropdown, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { TranslationOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../i18n'

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation('common')
  const current = i18n.resolvedLanguage ?? i18n.language

  const items: MenuProps['items'] = SUPPORTED_LANGUAGES.map((lng) => ({
    key: lng,
    label: t(`language.${lng}`),
    onClick: () => {
      if (lng !== current) void i18n.changeLanguage(lng)
    },
  }))

  return (
    <Dropdown
      menu={{ items, selectedKeys: [current] }}
      trigger={['click']}
      placement="bottomRight"
    >
      <Tooltip title={t('language.label')}>
        <button className="admin-header-action" aria-label={t('language.label')}>
          <TranslationOutlined style={{ fontSize: 18 }} />
        </button>
      </Tooltip>
    </Dropdown>
  )
}
