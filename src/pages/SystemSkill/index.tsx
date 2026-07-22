import { useState, useCallback } from 'react'
import { Typography, Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import SkillTable from './SkillTable'
import CategoryTab from './CategoryTab'
import DetailDrawer from './DetailDrawer'
import SkillFormModal from './SkillFormModal'
import type { SkillDetail } from '../../api/skill'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'

export default function SystemSkill() {
  const { t } = useTranslation('systemSkill')
  const canWrite = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'skill.write')
  )
  const [detailId, setDetailId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editSkill, setEditSkill] = useState<SkillDetail | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>
        {t('title')}
      </Typography.Title>

      <Tabs
        defaultActiveKey="skills"
        items={[
          {
            key: 'skills',
            label: t('tabs.skills'),
            children: (
              <SkillTable
                key={refreshKey}
                onView={(id) => setDetailId(id)}
                onUpload={() => {
                  if (canWrite) setUploadOpen(true)
                }}
                canWrite={canWrite}
              />
            ),
          },
          {
            key: 'categories',
            label: t('tabs.categories'),
            children: <CategoryTab canWrite={canWrite} />,
          },
        ]}
      />

      <DetailDrawer
        skillId={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        onDeleted={refresh}
        onEdit={(skill) => {
          if (!canWrite) return
          setDetailId(null)
          setEditSkill(skill)
        }}
        canManage={canWrite}
      />

      {canWrite && (
        <SkillFormModal
          open={uploadOpen || !!editSkill}
          editSkill={editSkill}
          onClose={() => { setUploadOpen(false); setEditSkill(null) }}
          onSuccess={refresh}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}
