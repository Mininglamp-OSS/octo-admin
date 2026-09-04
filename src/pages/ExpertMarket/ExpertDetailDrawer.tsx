/**
 * Read-only Expert detail drawer. Mirrors SystemMcp/DetailDrawer: fetch full
 * detail on open, grouped read-only sections, footer with re-upload (replace
 * spec) and inline delete confirm. Metadata is not hand-edited — content
 * changes go through re-upload.
 */

import { useEffect, useState } from 'react'
import { Button, Drawer, Skeleton, Tag, Typography, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  deleteSystemExpert,
  getSystemExpert,
  reuploadExpertContainer,
  type ExpertDetail,
} from '../../api/expert'
import { DetailSection, McpConfigBlock, SkillMdModal, SkillRefList, loadSkillMd } from './detailParts'
import ReuploadButton from './ReuploadButton'
import PluginMetrics from '../../components/PluginMetrics'
import type { ParsedContainer } from './parseContainer'

const { Text, Paragraph } = Typography

interface Props {
  expertId: string | null
  open: boolean
  canManage: boolean
  onClose: () => void
  onChanged: () => void
  onDeleted: (id: string) => void
}

export default function ExpertDetailDrawer({
  expertId,
  open,
  canManage,
  onClose,
  onChanged,
  onDeleted,
}: Props) {
  const { t } = useTranslation(['expertMarket', 'common'])
  const [detail, setDetail] = useState<ExpertDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [viewingSkill, setViewingSkill] = useState<{
    name: string
    skillPluginId?: string
    fallback: string
  } | null>(null)

  const reload = (id: string) => {
    let cancelled = false
    setLoading(true)
    getSystemExpert(id)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => {
        if (!cancelled) {
          message.error(err instanceof ApiError ? err.message : t('detail.loadFailed'))
          onClose()
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    if (!open || !expertId) {
      setDetail(null)
      return
    }
    setConfirmingDelete(false)
    setDeleting(false)
    setViewingSkill(null)
    return reload(expertId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expertId])

  const confirmDelete = async () => {
    if (!detail || deleting) return
    setDeleting(true)
    try {
      await deleteSystemExpert(detail.expert_id)
      message.success(t('delete.success'))
      onDeleted(detail.expert_id)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('delete.failed'))
    } finally {
      setDeleting(false)
    }
  }

  const handleReupload = async (file: File, _parsed: ParsedContainer) => {
    if (!detail) return
    // Send the ORIGINAL zip to the server-side container reupload, which rebuilds
    // the expert in place (preserving id/visibility/Space/owner) and re-parses
    // the package + bundled skills. Reupload intentionally does NOT pass a
    // category: the manifest category would otherwise silently revert an
    // operator's curated choice (and hard-block reupload when the manifest names
    // a category absent from the taxonomy). Omitting it makes the backend keep
    // the stored category — reupload only swaps content.
    await reuploadExpertContainer(detail.expert_id, file, undefined)
    // The rebuild is committed server-side. Refresh the parent list, then refetch
    // the drawer detail best-effort — a transient refetch failure must not surface
    // as a reupload error (reopening the drawer recovers the fresh state).
    onChanged()
    try {
      setDetail(await getSystemExpert(detail.expert_id))
    } catch {
      // Keep the stale detail; the list reload + a drawer reopen recover it.
    }
  }

  const footer = !detail || !canManage ? null : confirmingDelete ? (
    <div className="exp-drawer-footer exp-drawer-footer--confirm">
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t('delete.confirmDesc')}
      </Text>
      <Button onClick={() => setConfirmingDelete(false)} disabled={deleting}>
        {t('delete.cancel')}
      </Button>
      <Button danger type="primary" loading={deleting} onClick={confirmDelete}>
        {t('delete.ok')}
      </Button>
    </div>
  ) : (
    <div className="exp-drawer-footer">
      <Button danger icon={<DeleteOutlined />} onClick={() => setConfirmingDelete(true)}>
        {t('actions.delete')}
      </Button>
      <ReuploadButton expectKind="agent" onReady={handleReupload} />
    </div>
  )

  return (
    <Drawer
      title={detail ? detail.name : t('detail.title')}
      open={open}
      onClose={onClose}
      width={720}
      destroyOnClose
      className="admin-shell admin-drawer"
      footer={footer}
    >
      {loading || !detail ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <div className="exp-detail">
          <div className="exp-detail__meta">
            <span className="exp-detail__tile">{detail.short_name || detail.name.slice(0, 2)}</span>
            <div className="exp-detail__meta-body">
              <div className="exp-detail__summary">{detail.summary}</div>
              <div className="exp-detail__sub">
                {detail.category && <span className="pill-outline neutral">{detail.category}</span>}
                {detail.creator_name && <span>@{detail.creator_name}</span>}
              </div>
              {detail.tags?.length > 0 && (
                <div className="exp-detail__tags">
                  {detail.tags.map((tag) => (
                    <Tag key={tag} className="pill-outline brand" style={{ margin: 0 }}>
                      {tag}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DetailSection title={t('pluginMetrics.title', { ns: 'common' })}>
            <PluginMetrics
              pluginId={detail.expert_id}
              rating={detail.rating}
              viewCount={detail.view_count}
              installCount={detail.install_count}
              downloadCount={detail.download_count}
              canEditRating={canManage}
              onRatingChanged={(rating) => {
                setDetail((current) => current ? { ...current, rating } : current)
                onChanged()
              }}
            />
          </DetailSection>

          <DetailSection title={t('detail.instruction')}>
            <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {detail.instruction || '—'}
            </Paragraph>
          </DetailSection>

          <DetailSection title={t('detail.mcpConfig')}>
            <McpConfigBlock config={detail.mcp_config || '{}'} />
          </DetailSection>

          <DetailSection title={t('detail.skills')}>
            <SkillRefList
              skills={detail.skills}
              onView={(_index, s) =>
                setViewingSkill({
                  name: s.name,
                  skillPluginId: s.skill_plugin_id,
                  fallback: s.skill_md ?? '',
                })
              }
            />
          </DetailSection>
        </div>
      )}

      <SkillMdModal
        open={viewingSkill !== null}
        title={viewingSkill?.name ?? ''}
        load={() => loadSkillMd(viewingSkill)}
        onClose={() => setViewingSkill(null)}
      />
    </Drawer>
  )
}
