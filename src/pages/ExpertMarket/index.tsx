import { Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import CategoryTab from './CategoryTab'
import ExpertTab from './ExpertTab'
import SquadTab from './SquadTab'
import './expertMarket.css'

export default function ExpertMarket() {
  const { t } = useTranslation(['expertMarket'])

  return (
    <div>
      <h1 className="page-title">{t('pageTitle')}</h1>
      <p className="page-subtitle">{t('pageDesc')}</p>
      <Tabs
        defaultActiveKey="experts"
        items={[
          { key: 'experts', label: t('tab.experts'), children: <ExpertTab /> },
          { key: 'squads', label: t('tab.squads'), children: <SquadTab /> },
          { key: 'categories', label: t('tab.categories'), children: <CategoryTab /> },
        ]}
      />
    </div>
  )
}
