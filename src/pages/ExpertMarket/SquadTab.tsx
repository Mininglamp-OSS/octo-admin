import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Space as AntSpace, Table, Tag, message } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import {
  listSquadCategories,
  listSystemSquads,
  type ExpertCategory,
  type SquadListItem,
} from '../../api/expert'
import { ApiError } from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'
import SquadDetailDrawer from './SquadDetailDrawer'
import UploadModal from './UploadModal'
import VisibilityTag from '../../components/VisibilityTag'
import { useSpaceNameMap } from '../../hooks/useSpaceNameMap'

const PAGE_SIZE = 20

export default function SquadTab() {
  const { t } = useTranslation(['expertMarket', 'common'])
  const { nameOf } = useSpaceNameMap()
  const canWrite = useAuthStore((s) => hasManagerCapability(s.managerCapabilities, 'expert.write'))

  const [rows, setRows] = useState<SquadListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [pendingKeyword, setPendingKeyword] = useState('')
  const [categories, setCategories] = useState<ExpertCategory[]>([])
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const load = async (nextPage = page, kw = keyword) => {
    setLoading(true)
    try {
      const resp = await listSystemSquads({
        keyword: kw,
        limit: PAGE_SIZE,
        offset: (nextPage - 1) * PAGE_SIZE,
      })
      setRows(resp.items)
      setTotal(resp.total)
      setPage(nextPage)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, '')
    // The squad dropdown must list the expert_team taxonomy — the same set the
    // container import resolves the chosen category against — so a selection is
    // always resolvable on upload (review P1-2).
    listSquadCategories()
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
    setRows((prev) => prev.filter((r) => r.squad_id !== id))
    setTotal((prev) => Math.max(0, prev - 1))
    if (rows.length === 1 && page > 1) load(page - 1, keyword)
    setDrawerId(null)
  }

  const columns = useMemo<ColumnsType<SquadListItem>>(
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
        title: t('table.members'),
        dataIndex: 'member_count',
        key: 'member_count',
        width: 80,
        align: 'right',
        render: (v?: number) => <span className="mono">{v ?? 0}</span>,
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
    [t, nameOf]
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
              // Categories tab since this tab mounted. List the expert_team
              // taxonomy so the dropdown matches what the import resolves against.
              listSquadCategories().then(setCategories).catch(() => {})
              setUploadOpen(true)
            }}
          >
            {t('createSquad')}
          </Button>
        )}
      </div>

      <Table<SquadListItem>
        rowKey="squad_id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: t('emptySquad') }}
        onRow={(r) => ({
          onClick: () => setDrawerId(r.squad_id),
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

      <SquadDetailDrawer
        squadId={drawerId}
        open={drawerId !== null}
        canManage={canWrite}
        onClose={() => setDrawerId(null)}
        onChanged={() => load(page, keyword)}
        onDeleted={handleDeleted}
      />

      <UploadModal
        open={uploadOpen}
        expectKind="squad"
        categories={categories}
        onClose={() => setUploadOpen(false)}
        onImported={() => load(1, keyword)}
      />
    </div>
  )
}
