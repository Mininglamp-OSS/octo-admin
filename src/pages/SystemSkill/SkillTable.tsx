import { useState, useEffect, useCallback, useRef } from 'react'
import { Table, Button, Space, Input, Select, Tag, Avatar, message } from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import {
  listSkills,
  listCategories,
  type SkillListItem,
  type CategoryItem,
} from '../../api/skill'

const LIMIT = 20
const DEBOUNCE_MS = 300

const VISIBILITY_COLOR: Record<string, string> = {
  public: 'green',
  space: 'blue',
  private: 'default',
}

interface Props {
  onView: (id: string) => void
  onUpload: () => void
  canWrite: boolean
}

export default function SkillTable({ onView, onUpload, canWrite }: Props) {
  const { t } = useTranslation('systemSkill')
  const [data, setData] = useState<SkillListItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [page, setPage] = useState(0) // index into cursors
  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    listCategories().then(setCategories).catch(() => {})
  }, [])

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedKeyword(keyword)
      setPage(0)
      setCursors([undefined])
    }, DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [keyword])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await listSkills({
        q: debouncedKeyword || undefined,
        category_id: categoryFilter || undefined,
        cursor: cursors[page],
        limit: LIMIT,
      })
      setData(resp.items || [])
      setHasMore(!!resp.next_cursor)
      if (resp.next_cursor && !cursors[page + 1]) {
        setCursors((prev) => [...prev, resp.next_cursor!])
      }
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, cursors, debouncedKeyword, categoryFilter])

  useEffect(() => { fetchList() }, [fetchList])

  const categoryOptions = [
    { value: '', label: t('list.categoryFilter') },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ]

  const columns: ColumnsType<SkillListItem> = [
    {
      title: t('column.name'),
      key: 'name',
      width: 280,
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar
            src={record.icon_url}
            size={36}
            style={{ background: '#6366f1', flexShrink: 0 }}
          >
            {record.display_name?.charAt(0) || record.name?.charAt(0)}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <a onClick={(e) => { e.stopPropagation(); onView(record.id) }}>{record.display_name || record.name}</a>
            </div>
            <div style={{ fontSize: 12, color: 'var(--a-text-tertiary, #999)', fontFamily: 'monospace' }}>
              {record.name}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: t('column.category'),
      width: 120,
      render: (_, record) => categories.find((c) => c.id === record.category_id)?.name || record.category_name || '—',
    },
    {
      title: t('column.version'),
      dataIndex: 'version',
      width: 90,
      render: (v: string) => <Tag>{v || '—'}</Tag>,
    },
    {
      title: t('column.owner'),
      dataIndex: 'owner_name',
      width: 120,
    },
    {
      title: t('column.visibility'),
      dataIndex: 'visibility',
      width: 90,
      render: (vis: string) => (
        <Tag color={VISIBILITY_COLOR[vis]}>{t(`visibility.${vis}` as any)}</Tag>
      ),
    },
    {
      title: t('column.createdAt'),
      dataIndex: 'created_at',
      width: 170,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: 'var(--a-text-tertiary, #999)', fontSize: 13 }}>
          {data.length > 0 ? t('list.total', { count: data.length }) : ''}
        </span>
        <Space>
          <Select
            value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v); setPage(0); setCursors([undefined]) }}
            options={categoryOptions}
            style={{ width: 140 }}
          />
          <Input
            placeholder={t('list.search')}
            prefix={<SearchOutlined />}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 200 }}
          />
          {canWrite && (
            <Button type="primary" icon={<PlusOutlined />} onClick={onUpload}>
              {t('list.upload')}
            </Button>
          )}
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        onRow={(record) => ({ onClick: () => onView(record.id), style: { cursor: 'pointer' } })}
        size="middle"
      />

      {(page > 0 || hasMore) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t('upload.prev')}
          </Button>
          <Button size="small" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
            {t('upload.next')}
          </Button>
        </div>
      )}
    </div>
  )
}
