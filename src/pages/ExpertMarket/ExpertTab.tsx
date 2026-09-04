import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Space as AntSpace, Table, Tag, message } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import {
  listExpertCategories,
  listSystemExperts,
  type ExpertCategory,
  type ExpertListItem,
} from '../../api/expert'
import { ApiError } from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'
import ExpertDetailDrawer from './ExpertDetailDrawer'
import UploadModal from './UploadModal'
import VisibilityTag from '../../components/VisibilityTag'
import PluginRating from '../../components/PluginRating'
import { useSpaceNameMap } from '../../hooks/useSpaceNameMap'
import { mergeRatingOverrides, recordRatingOverride } from '../../utils/ratingOverrides'

const PAGE_SIZE = 20

export default function ExpertTab() {
  const { t } = useTranslation(['expertMarket', 'common'])
  const { nameOf } = useSpaceNameMap()
  const canWrite = useAuthStore((s) => hasManagerCapability(s.managerCapabilities, 'expert.write'))

  const [rows, setRows] = useState<ExpertListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [pendingKeyword, setPendingKeyword] = useState('')
  const [categories, setCategories] = useState<ExpertCategory[]>([])
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const loadSequence = useRef(0)
  const ratingOverrides = useRef(new Map<string, number | null>())

  const load = async (nextPage = page, kw = keyword) => {
    const request = ++loadSequence.current
    setLoading(true)
    try {
      const resp = await listSystemExperts({
        keyword: kw,
        limit: PAGE_SIZE,
        offset: (nextPage - 1) * PAGE_SIZE,
      })
      if (request !== loadSequence.current) return
      setRows(mergeRatingOverrides(resp.items, ratingOverrides.current, (item) => item.expert_id))
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
    listExpertCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    const kw = pendingKeyword.trim()
    setKeyword(kw)
    load(1, kw)
  }

  const handleDeleted = (id: string) => {
    setRows((prev) => prev.filter((r) => r.expert_id !== id))
    setTotal((prev) => Math.max(0, prev - 1))
    if (rows.length === 1 && page > 1) load(page - 1, keyword)
    setDrawerId(null)
  }

  const columns = useMemo<ColumnsType<ExpertListItem>>(
    () => [
      {
        title: t('table.name'),
        dataIndex: 'name',
        key: 'name',
        render: (name: string, r) => (
          <div className="exp-cell-name">
            <span className="exp-cell-name__tile">{r.short_name || name.slice(0, 2)}</span>
            <div className="exp-cell-name__text">
              <span className="cell-primary">{name}</span>
              {r.summary && <span className="exp-cell-name__sub">{r.summary}</span>}
            </div>
          </div>
        ),
      },
      {
        title: t('table.category'),
        dataIndex: 'category',
        key: 'category',
        width: 140,
        render: (v: string) => (v ? <Tag className="pill-outline neutral">{v}</Tag> : '—'),
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
              {tags.length > 3 && <span className="exp-more">+{tags.length - 3}</span>}
            </AntSpace>
          ) : (
            <span className="exp-more">—</span>
          ),
      },
      {
        title: t('pluginMetrics.rating', { ns: 'common' }),
        dataIndex: 'rating',
        key: 'rating',
        width: 150,
        render: (rating: number | null, record) => (
          <PluginRating compact pluginId={record.expert_id} rating={rating} canEdit={canWrite}
            onChanged={(next) => {
              recordRatingOverride(ratingOverrides.current, record.expert_id, next)
              setRows((prev) => prev.map((row) =>
                row.expert_id === record.expert_id ? { ...row, rating: next } : row
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
        <Button icon={<ReloadOutlined />} onClick={() => load(page, keyword)} loading={loading} />
        {canWrite && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              // Refresh the category options — they may have changed on the
              // Categories tab since this tab mounted.
              listExpertCategories().then(setCategories).catch(() => {})
              setUploadOpen(true)
            }}
          >
            {t('createExpert')}
          </Button>
        )}
      </div>

      <Table<ExpertListItem>
        rowKey="expert_id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('emptyExpert') }}
        onRow={(r) => ({
          onClick: () => setDrawerId(r.expert_id),
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

      <ExpertDetailDrawer
        expertId={drawerId}
        open={drawerId !== null}
        canManage={canWrite}
        onClose={() => setDrawerId(null)}
        onChanged={(ratingChange) => {
          if (ratingChange) {
            recordRatingOverride(ratingOverrides.current, ratingChange.id, ratingChange.rating)
            setRows((prev) => prev.map((row) =>
              row.expert_id === ratingChange.id ? { ...row, rating: ratingChange.rating } : row
            ))
          }
          load(page, keyword)
        }}
        onDeleted={handleDeleted}
      />

      <UploadModal
        open={uploadOpen}
        expectKind="agent"
        categories={categories}
        onClose={() => setUploadOpen(false)}
        onImported={() => load(1, keyword)}
      />
    </div>
  )
}
