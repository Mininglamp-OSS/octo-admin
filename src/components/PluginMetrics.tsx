import { Space, Statistic } from 'antd'
import { useTranslation } from 'react-i18next'
import PluginRating from './PluginRating'

interface Props {
  pluginId: string
  rating: number | null
  viewCount: number
  installCount?: number
  downloadCount?: number
  canEditRating?: boolean
  onRatingChanged?: (rating: number | null) => void
}

export default function PluginMetrics({
  pluginId,
  rating,
  viewCount,
  installCount,
  downloadCount,
  canEditRating,
  onRatingChanged,
}: Props) {
  const { t } = useTranslation('common')
  return (
    <Space size="large" wrap>
      <Statistic
        title={t('pluginMetrics.rating')}
        valueRender={() => (
          <PluginRating
            pluginId={pluginId}
            rating={rating}
            canEdit={canEditRating}
            onChanged={onRatingChanged}
          />
        )}
      />
      <Statistic title={t('pluginMetrics.views')} value={viewCount} />
      {installCount !== undefined && (
        <Statistic title={t('pluginMetrics.installs')} value={installCount} />
      )}
      {downloadCount !== undefined && (
        <Statistic title={t('pluginMetrics.downloads')} value={downloadCount} />
      )}
    </Space>
  )
}
