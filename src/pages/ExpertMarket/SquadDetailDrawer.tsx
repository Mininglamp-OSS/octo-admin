/**
 * Read-only Squad detail drawer. Same shape as ExpertDetailDrawer, plus
 * squad-only sections: leader, dispatch strategies, dependencies, permission,
 * and a member roster where each member expands to its own instruction /
 * mcp_config / skills.
 */

import { useEffect, useState } from 'react'
import { Button, Collapse, Drawer, Skeleton, Tag, Typography, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  deleteSystemSquad,
  getSystemSquad,
  getSystemSquadSkillMd,
  patchSystemSquad,
  type SkillWrite,
  type SquadDetail,
} from '../../api/expert'
import { DetailSection, McpConfigBlock, SkillMdModal, SkillRefList } from './detailParts'
import ReuploadButton from './ReuploadButton'
import { buildSquadParams } from './submitContainer'
import type { ParsedSquad } from './parseContainer'

const { Text, Paragraph } = Typography

interface Props {
  squadId: string | null
  open: boolean
  canManage: boolean
  onClose: () => void
  onChanged: () => void
  onDeleted: (id: string) => void
}

export default function SquadDetailDrawer({
  squadId,
  open,
  canManage,
  onClose,
  onChanged,
  onDeleted,
}: Props) {
  const { t } = useTranslation(['expertMarket', 'common'])
  const [detail, setDetail] = useState<SquadDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [viewingSkill, setViewingSkill] = useState<{
    memberKey: string
    index: number
    name: string
  } | null>(null)

  useEffect(() => {
    if (!open || !squadId) {
      setDetail(null)
      return
    }
    setConfirmingDelete(false)
    setDeleting(false)
    setViewingSkill(null)
    let cancelled = false
    setLoading(true)
    getSystemSquad(squadId)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, squadId])

  const confirmDelete = async () => {
    if (!detail || deleting) return
    setDeleting(true)
    try {
      await deleteSystemSquad(detail.squad_id)
      message.success(t('delete.success'))
      onDeleted(detail.squad_id)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('delete.failed'))
    } finally {
      setDeleting(false)
    }
  }

  const handleReupload = async (manifest: unknown, uploaded: Map<string, SkillWrite>) => {
    if (!detail) return
    const { category, ...rest } = buildSquadParams(manifest as ParsedSquad, uploaded)
    // resolveCategory rejects an empty name on PATCH too — when the container
    // omits category, leave the record's current one untouched.
    const updated = await patchSystemSquad(
      detail.squad_id,
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
      <ReuploadButton expectKind="squad" onReady={handleReupload} />
    </div>
  )

  return (
    <Drawer
      title={detail ? detail.name : t('detail.titleSquad')}
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
                <span>{t('table.memberCount', { count: detail.members?.length ?? 0 })}</span>
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

          <DetailSection title={t('detail.leader')}>
            <Text>{detail.leader || '—'}</Text>
          </DetailSection>

          {detail.strategies?.length > 0 && (
            <DetailSection title={t('detail.strategies')}>
              <ol className="exp-strategies">
                {detail.strategies.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </DetailSection>
          )}

          {(detail.dependencies?.blocking?.length > 0 ||
            detail.dependencies?.recommended?.length > 0) && (
            <DetailSection title={t('detail.dependencies')}>
              <dl className="exp-kv">
                {detail.dependencies.blocking?.length > 0 && (
                  <>
                    <dt>{t('detail.blocking')}</dt>
                    <dd>{detail.dependencies.blocking.join('、')}</dd>
                  </>
                )}
                {detail.dependencies.recommended?.length > 0 && (
                  <>
                    <dt>{t('detail.recommended')}</dt>
                    <dd>{detail.dependencies.recommended.join('、')}</dd>
                  </>
                )}
              </dl>
            </DetailSection>
          )}

          {detail.permission && (
            <DetailSection title={t('detail.permission')}>
              <Text>{detail.permission}</Text>
            </DetailSection>
          )}

          <DetailSection title={t('detail.members')}>
            <Collapse
              items={(detail.members ?? []).map((m) => ({
                key: m.member_key,
                label: (
                  <span>
                    {m.name}
                    {m.role ? <span className="exp-member__role"> · {m.role}</span> : ''}
                    {m.is_leader && (
                      <Tag className="pill-outline brand" style={{ marginLeft: 8 }}>
                        {t('detail.leaderBadge')}
                      </Tag>
                    )}
                  </span>
                ),
                children: (
                  <div className="exp-member__body">
                    <h5 className="exp-member__head">{t('detail.instruction')}</h5>
                    <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                      {m.instruction || '—'}
                    </Paragraph>
                    <h5 className="exp-member__head">{t('detail.mcpConfig')}</h5>
                    <McpConfigBlock config={m.mcp_config || '{}'} />
                    <h5 className="exp-member__head">{t('detail.skills')}</h5>
                    <SkillRefList
                      skills={m.skills}
                      onView={(index, s) =>
                        setViewingSkill({ memberKey: m.member_key, index, name: s.name })
                      }
                    />
                  </div>
                ),
              }))}
            />
          </DetailSection>
        </div>
      )}

      <SkillMdModal
        open={viewingSkill !== null}
        title={viewingSkill?.name ?? ''}
        load={() =>
          getSystemSquadSkillMd(detail!.squad_id, viewingSkill!.memberKey, viewingSkill!.index)
        }
        onClose={() => setViewingSkill(null)}
      />
    </Drawer>
  )
}
