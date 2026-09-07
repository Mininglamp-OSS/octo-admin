import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Space as AntSpace, Table, Tabs, Tag, message } from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import {
  listSystemMcps,
  type McpDetail,
  type McpListItem,
} from '../../api/mcp'
import { ApiError } from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'
import McpDetailDrawer from './DetailDrawer'
import McpFormModal from './FormModal'
import CategoryTab from './CategoryTab'
import VisibilityTag from '../../components/VisibilityTag'
import PluginRating from '../../components/PluginRating'
import { useSpaceNameMap } from '../../hooks/useSpaceNameMap'
import { createRatingOverrideLedger, mergeRatingOverrides, ratingOverrideSequence, recordRatingOverride } from '../../utils/ratingOverrides'
import './systemMcp.css'

const PAGE_SIZE = 20

/**
 * Admin page listing every visibility=system MCP across all Spaces (contract:
 * octo-marketplace/docs/api/mcp-v1.md §9). Follows the console-standard
 * layout of Users / Spaces: page-title header, toolbar with search + primary
 * action, dense antd Table with inline row-actions. Detail lives in a
 * Drawer (SpaceDetailDrawer pattern); create/edit share one Modal.
 */
export default function SystemMcp() {
  const { t } = useTranslation(['systemMcp', 'common'])
  const { nameOf } = useSpaceNameMap()
  const canWrite = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'mcp.write')
  )

  const [rows, setRows] = useState<McpListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [pendingKeyword, setPendingKeyword] = useState('')

  const [drawer, setDrawer] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<McpDetail | null>(null)
  const loadSequence = useRef(0)
  const ratingOverrides = useRef(createRatingOverrideLedger())

  const load = async (nextPage = page, kw = keyword) => {
    const request = ++loadSequence.current
    const seenRatingSequence = ratingOverrideSequence(ratingOverrides.current)
    setLoading(true)
    try {
      const resp = await listSystemMcps({
        keyword: kw,
        limit: PAGE_SIZE,
        offset: (nextPage - 1) * PAGE_SIZE,
      })
      if (request !== loadSequence.current) return
      setRows(mergeRatingOverrides(resp.items, ratingOverrides.current, seenRatingSequence, (item) => item.mcp_id))
      setTotal(resp.total)
      setPage(nextPage)
    } catch (err) {
      if (request === loadSequence.current) {
        message.error(err instanceof ApiError ? err.message : t('loadFailed'))
      }
    } finally {
      if (request === loadSequence.current) setLoading(false)
    }
  }

  useEffect(() => {
    load(1, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    const kw = pendingKeyword.trim()
    setKeyword(kw)
    load(1, kw)
  }

  const openDetail = (id: string) => setDrawer({ open: true, id })
  const closeDetail = () => setDrawer({ open: false, id: null })

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (detail: McpDetail) => {
    setDrawer({ open: false, id: null })
    setEditing(detail)
    setFormOpen(true)
  }

  const handleDeleted = (id: string) => {
    setRows((prev) => prev.filter((r) => r.mcp_id !== id))
    setTotal((prev) => Math.max(0, prev - 1))
    // If the last row on this page just disappeared and we're past page 1,
    // reload the previous page so the user isn't left staring at empty state.
    const isLastOnPage = rows.length === 1 && page > 1
    if (isLastOnPage) load(page - 1, keyword)
    closeDetail()
  }

  const handleSaved = (updated: McpDetail) => {
    // Edit: patch the row in place. Only project down to McpListItem fields
    // so `rows` stays a list-projection and doesn't accumulate detail-only
    // payload (tools / quick_start / faqs / usage_examples / notes / …).
    const existingIdx = rows.findIndex((r) => r.mcp_id === updated.mcp_id)
    if (existingIdx !== -1) {
      recordRatingOverride(ratingOverrides.current, updated.mcp_id, updated.rating)
      setRows((prev) =>
        prev.map((r) =>
          r.mcp_id === updated.mcp_id
            ? {
                ...r,
                name: updated.name,
                slogan: updated.slogan,
                category: updated.category,
                icon: updated.icon,
                icon_url: updated.icon_url,
                publisher: updated.publisher,
                scope: updated.scope,
                space_id: updated.space_id,
                tags: updated.tags,
                tool_count: updated.tool_count,
                rating: updated.rating,
                view_count: updated.view_count,
                install_count: updated.install_count,
                download_count: updated.download_count,
                creator_name: updated.creator_name,
                created_by_type: updated.created_by_type,
              }
            : r
        )
      )
      return
    }
    // Create: server owns sort order + keyword filter + total, so refetch
    // page 1 rather than optimistically prepending (which would show rows
    // that don't match the active keyword, or misplace them under a non-
    // recency sort key).
    load(1, keyword)
  }

  const columns = useMemo<ColumnsType<McpListItem>>(
    () => [
      {
        title: t('table.name'),
        dataIndex: 'name',
        key: 'name',
        render: (name: string, r) => (
          <div className="mcp-cell-name">
            <span className="mcp-cell-name__icon">
              {r.icon_url &&
              (r.icon_url.startsWith('http') || r.icon_url.startsWith('data:')) ? (
                <img src={r.icon_url} alt={name} />
              ) : (
                r.icon_url || '🧩'
              )}
            </span>
            <div className="mcp-cell-name__text">
              <span className="cell-primary">{name}</span>
              {r.slogan && <span className="mcp-cell-name__sub">{r.slogan}</span>}
            </div>
          </div>
        ),
      },
      {
        title: t('table.category'),
        dataIndex: 'category',
        key: 'category',
        width: 140,
        render: (v: string) => (
          <Tag className="pill-outline neutral">
            {t(`categoryOptions.${v}`, { defaultValue: v })}
          </Tag>
        ),
      },
      {
        title: t('table.tags'),
        dataIndex: 'tags',
        key: 'tags',
        width: 200,
        render: (tags: string[]) =>
          tags?.length ? (
            <AntSpace size={4} wrap>
              {tags.slice(0, 3).map((tag) => (
                <span key={tag} className="pill-outline brand">
                  {tag}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="mcp-more">+{tags.length - 3}</span>
              )}
            </AntSpace>
          ) : (
            <span className="mcp-more">—</span>
          ),
      },
      {
        title: t('table.tools'),
        dataIndex: 'tool_count',
        key: 'tool_count',
        width: 80,
        align: 'right',
        render: (v: number) => <span className="mono">{v}</span>,
      },
      {
        title: t('pluginMetrics.rating', { ns: 'common' }),
        dataIndex: 'rating',
        key: 'rating',
        width: 150,
        render: (rating: number | null, record) => (
          <PluginRating
            compact
            pluginId={record.mcp_id}
            rating={rating}
            canEdit={canWrite}
            onChanged={(next) => {
              recordRatingOverride(ratingOverrides.current, record.mcp_id, next)
              setRows((prev) => prev.map((row) =>
                row.mcp_id === record.mcp_id ? { ...row, rating: next } : row
              ))
            }}
          />
        ),
      },
      {
        title: t('pluginMetrics.views', { ns: 'common' }),
        dataIndex: 'view_count',
        key: 'views',
        width: 90,
        align: 'right',
      },
      {
        title: t('pluginMetrics.installs', { ns: 'common' }),
        dataIndex: 'install_count',
        key: 'installs',
        width: 90,
        align: 'right',
      },
      {
        title: t('table.visibility', { ns: 'common' }),
        dataIndex: 'scope',
        key: 'scope',
        width: 110,
        render: (scope: string) => <VisibilityTag scope={scope} />,
      },
      {
        title: t('table.space', { ns: 'common' }),
        dataIndex: 'space_id',
        key: 'space_id',
        width: 160,
        render: (spaceId?: string) => nameOf(spaceId),
      },
      {
        title: t('table.creator'),
        dataIndex: 'creator_name',
        key: 'creator_name',
        width: 140,
        render: (v: string) => v || '—',
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, nameOf, canWrite]
  )

  return (
    <div>
      <h1 className="page-title">{t('pageTitle')}</h1>
      <p className="page-subtitle">{t('pageDesc')}</p>

      <Tabs
        defaultActiveKey="mcps"
        items={[
          {
            key: 'mcps',
            label: t('tab.mcps'),
            children: (
              <>
                <div className="toolbar">
                  <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder={t('searchPlaceholder')}
                    value={pendingKeyword}
                    onChange={(e) => setPendingKeyword(e.target.value)}
                    onPressEnter={handleSearch}
                    onBlur={handleSearch}
                    style={{ width: 280 }}
                  />
                  <div className="toolbar-spacer" />
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => load(page, keyword)}
                    loading={loading}
                  />
                  {canWrite && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                      {t('create')}
                    </Button>
                  )}
                </div>

                <Table<McpListItem>
                  rowKey="mcp_id"
                  loading={loading}
                  columns={columns}
                  dataSource={rows}
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: t('empty') }}
                  onRow={(r) => ({
                    onClick: () => openDetail(r.mcp_id),
                    style: { cursor: 'pointer' },
                  })}
                  pagination={{
                    current: page,
                    pageSize: PAGE_SIZE,
                    total,
                    showSizeChanger: false,
                    onChange: (p) => load(p, keyword),
                  }}
                />
              </>
            ),
          },
          {
            key: 'categories',
            label: t('tab.categories'),
            children: <CategoryTab />,
          },
        ]}
      />

      <McpDetailDrawer
        mcpId={drawer.id}
        open={drawer.open}
        onClose={closeDetail}
        canManage={canWrite}
        onEdit={openEdit}
        onRatingChanged={(id, rating) => {
          recordRatingOverride(ratingOverrides.current, id, rating)
          setRows((prev) => prev.map((row) =>
            row.mcp_id === id ? { ...row, rating } : row
          ))
        }}
        onDeleted={handleDeleted}
      />

      <McpFormModal
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSaved={handleSaved}
      />
    </div>
  )
}
