import { Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import CategoryTab from './CategoryTab'
import SkillTab from './SkillTab'

export default function SkillMarket() {
  const { t } = useTranslation(['skillMarket'])

  return (
    <div>
      <h1 className="page-title">{t('pageTitle')}</h1>
      <p className="page-subtitle">{t('pageDesc')}</p>
      <Tabs
        defaultActiveKey="categories"
        items={[
          {
            key: 'categories',
            label: t('tab.categories'),
            children: <CategoryTab />,
          },
          {
            key: 'skills',
            label: t('tab.skills'),
            children: <SkillTab />,
          },
        ]}
      />
    </div>
  )
}
