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
  getSystemExpertSkillMd,
  patchSystemExpert,
  type ExpertDetail,
} from '../../api/expert'
import { DetailSection, McpConfigBlock, SkillMdModal, SkillRefList } from './detailParts'
import ReuploadButton from './ReuploadButton'
import { buildExpertParams } from './submitContainer'
import type { ParsedExpert } from './parseContainer'

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
  const [viewingSkill, setViewingSkill] = useState<{ index: number; name: string } | null>(null)

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

  const handleReupload = async (manifest: unknown, uploaded: Map<string, import('../../api/expert').SkillWrite>) => {
    if (!detail) return
    const { category, ...rest } = buildExpertParams(manifest as ParsedExpert, uploaded)
    // resolveCategory rejects an empty name on PATCH too — when the container
    // omits category, leave the record's current one untouched.
    const updated = await patchSystemExpert(
      detail.expert_id,
      category ? { category, ...rest } : rest
    )
    setDetail(updated)
    onChanged()
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
              onView={(index, s) => setViewingSkill({ index, name: s.name })}
            />
          </DetailSection>
        </div>
      )}

      <SkillMdModal
        open={viewingSkill !== null}
        title={viewingSkill?.name ?? ''}
        load={() => getSystemExpertSkillMd(detail!.expert_id, viewingSkill!.index)}
        onClose={() => setViewingSkill(null)}
      />
    </Drawer>
  )
}
