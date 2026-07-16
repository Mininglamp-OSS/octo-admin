/**
 * Read-only System MCP detail drawer. Follows the SpaceDetailDrawer pattern:
 * antd Drawer with `admin-shell admin-drawer` className so the design tokens
 * cascade in and antd's dropdown/tooltip portals stay themed.
 *
 * Content is grouped into small sections (概览 / 接入方式 / 工具清单 / 使用示例
 * / 常见问题 / 注意事项), matching octo-web's dmworkmcp detail order.
 */

import { useEffect, useState } from 'react'
import { Button, Drawer, Skeleton, Tag, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  deleteSystemMcp,
  getSystemMcp,
  type McpDetail,
} from '../../api/mcp'

const { Text } = Typography

interface Props {
  mcpId: string | null
  open: boolean
  onClose: () => void
  canManage: boolean
  onEdit: (detail: McpDetail) => void
  onDeleted: (id: string) => void
}

export default function McpDetailDrawer({
  mcpId,
  open,
  onClose,
  canManage,
  onEdit,
  onDeleted,
}: Props) {
  const { t } = useTranslation(['systemMcp', 'common'])
  const [detail, setDetail] = useState<McpDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open || !mcpId) {
      setDetail(null)
      return
    }
    setConfirmingDelete(false)
    setDeleting(false)
    let cancelled = false
    setLoading(true)
    getSystemMcp(mcpId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled) {
          message.error(
            err instanceof ApiError ? err.message : t('detail.loadFailed')
          )
          onClose()
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mcpId])

  const confirmDelete = async () => {
    if (!detail || deleting) return
    setDeleting(true)
    try {
      await deleteSystemMcp(detail.id)
      message.success(t('delete.success'))
      onDeleted(detail.id)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('delete.failed'))
    } finally {
      setDeleting(false)
    }
  }

  const footer = !detail || !canManage ? null : confirmingDelete ? (
    <div className="mcp-drawer-footer mcp-drawer-footer--confirm">
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
    <div className="mcp-drawer-footer">
      <Button
        danger
        icon={<DeleteOutlined />}
        onClick={() => setConfirmingDelete(true)}
      >
        {t('actions.delete')}
      </Button>
      <Button
        type="primary"
        icon={<EditOutlined />}
        onClick={() => onEdit(detail)}
      >
        {t('actions.edit')}
      </Button>
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
        <DetailBody detail={detail} />
      )}
    </Drawer>
  )
}

function DetailBody({ detail }: { detail: McpDetail }) {
  const { t } = useTranslation(['systemMcp'])
  const q = detail.quickStart
  const isRemote =
    q.transport === 'streamable-http' || q.transport === 'sse'

  return (
    <div className="mcp-detail">
      {/* 概览 — icon + name + slogan + meta line + tags */}
      <div className="mcp-detail__meta">
        <div className="mcp-detail__icon">
          {detail.icon &&
          (detail.icon.startsWith('http') || detail.icon.startsWith('data:')) ? (
            <img src={detail.icon} alt={detail.name} />
          ) : (
            <span>{detail.icon || '🧩'}</span>
          )}
        </div>
        <div className="mcp-detail__meta-body">
          {detail.slogan && (
            <div className="mcp-detail__slogan">{detail.slogan}</div>
          )}
          <div className="mcp-detail__sub">
            <span className="pill-outline neutral">
              {t(`categoryOptions.${detail.category}`, {
                defaultValue: detail.category,
              })}
            </span>
            <span className="mcp-detail__sub-sep">·</span>
            <span>
              {t('detail.toolCount', {
                defaultValue: '{{count}} tools',
                count: detail.toolCount,
              })}
            </span>
            {detail.creatorName && (
              <>
                <span className="mcp-detail__sub-sep">·</span>
                <span>@{detail.creatorName}</span>
              </>
            )}
          </div>
          {detail.tags?.length > 0 && (
            <div className="mcp-detail__tags">
              {detail.tags.map((tag) => (
                <Tag key={tag} className="pill-outline brand" style={{ margin: 0 }}>
                  {tag}
                </Tag>
              ))}
            </div>
          )}
        </div>
      </div>

      <DetailSection title={t('detail.section.connection')}>
        <dl className="mcp-kv">
          <dt>{t('form.transport')}</dt>
          <dd>
            {t(`transportOptions.${q.transport}`, { defaultValue: q.transport })}
          </dd>
          {isRemote ? (
            <>
              <dt>{t('form.url')}</dt>
              <dd className="mono">{q.url || '—'}</dd>
              <dt>{t('form.authType')}</dt>
              <dd>{q.authType || 'none'}</dd>
              {q.headers && Object.keys(q.headers).length > 0 && (
                <>
                  <dt>{t('form.headers')}</dt>
                  <dd>
                    <pre className="mcp-kv__pre">
                      {Object.entries(q.headers)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\n')}
                    </pre>
                  </dd>
                </>
              )}
            </>
          ) : (
            <>
              <dt>{t('form.command')}</dt>
              <dd className="mono">{q.command || '—'}</dd>
              {q.args && q.args.length > 0 && (
                <>
                  <dt>{t('form.args')}</dt>
                  <dd className="mono">{q.args.join(' ')}</dd>
                </>
              )}
              {q.env && Object.keys(q.env).length > 0 && (
                <>
                  <dt>{t('form.env')}</dt>
                  <dd>
                    <pre className="mcp-kv__pre">
                      {Object.entries(q.env)
                        .map(([k, v]) => `${k}=${v}`)
                        .join('\n')}
                    </pre>
                  </dd>
                </>
              )}
            </>
          )}
        </dl>
      </DetailSection>

      <DetailSection title={t('detail.section.tools')}>
        {detail.tools?.length ? (
          <ul className="mcp-list">
            {detail.tools.map((tool, i) => (
              <li className="mcp-list__item" key={`${tool.name}-${i}`}>
                <div className="mcp-list__title mono">{tool.name}</div>
                {tool.description && (
                  <div className="mcp-list__desc">{tool.description}</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Text type="secondary">{t('detail.section.emptyTools')}</Text>
        )}
      </DetailSection>

      {detail.usageExamples?.length > 0 && (
        <DetailSection title={t('detail.section.examples')}>
          <ul className="mcp-list mcp-list--quote">
            {detail.usageExamples.map((ex, i) => (
              <li key={i} className="mcp-list__item">
                {ex}
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {detail.faqs?.length > 0 && (
        <DetailSection title={t('detail.section.faqs')}>
          <dl className="mcp-faq">
            {detail.faqs.map((faq, i) => (
              <div key={i}>
                <dt>{faq.question}</dt>
                <dd>{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </DetailSection>
      )}

      {detail.notes?.length > 0 && (
        <DetailSection title={t('detail.section.notes')}>
          <ul className="mcp-notes">
            {detail.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </DetailSection>
      )}
    </div>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mcp-detail__section">
      <h4 className="mcp-detail__section-title">{title}</h4>
      {children}
    </section>
  )
}
