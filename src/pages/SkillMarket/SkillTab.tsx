import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, message, Popconfirm, Select, Space, Table, Tag } from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import {
  listAdminSkills,
  deleteAdminSkill,
  downloadAdminSkillPackage,
  listSkillCategories,
  getAdminSkill,
  type SkillListItem,
  type SkillDetail,
  type CategoryItem,
} from '../../api/skill'
import { ApiError } from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'
import SkillDetailDrawer from './SkillDetailDrawer'
import SkillFormModal from '../SystemSkill/SkillFormModal'
import SkillUploadModal from './SkillUploadModal'
import VisibilityTag from '../../components/VisibilityTag'
import PluginRating from '../../components/PluginRating'
import { useSpaceNameMap } from '../../hooks/useSpaceNameMap'
import { mergeRatingOverrides, recordRatingOverride } from '../../utils/ratingOverrides'

const PAGE_SIZE = 20

export default function SkillTab() {
  const { t } = useTranslation(['skillMarket', 'common'])
  const { nameOf } = useSpaceNameMap()
  const canWrite = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'skill.write')
  )

  const [rows, setRows] = useState<SkillListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [pendingKeyword, setPendingKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [sort, setSort] = useState<string>('latest')
  const [categories, setCategories] = useState<CategoryItem[]>([])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editSkill, setEditSkill] = useState<SkillDetail | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const loadSequence = useRef(0)
  const ratingOverrides = useRef(new Map<string, number | null>())

  const load = useCallback(
    async (nextPage = page, kw = keyword, cat = categoryFilter, s = sort) => {
      const request = ++loadSequence.current
      setLoading(true)
      try {
        const resp = await listAdminSkills({
          q: kw || undefined,
          category_id: cat || undefined,
          sort: s || undefined,
          page: nextPage,
          page_size: PAGE_SIZE,
        })
        if (request !== loadSequence.current) return
        setRows(mergeRatingOverrides(resp.items ?? [], ratingOverrides.current, (item) => item.skill_id))
        setTotal(resp.total)
        setPage(nextPage)
      } catch (err) {
        if (request === loadSequence.current) {
          message.error(err instanceof ApiError ? err.message : t('skill.loadFailed'))
        }
      } finally {
        if (request === loadSequence.current) setLoading(false)
      }
    },
    [page, keyword, categoryFilter, sort, t]
  )

  useEffect(() => {
    load(1, '', '', 'latest')
    listSkillCategories().then(setCategories).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    const kw = pendingKeyword.trim()
    setKeyword(kw)
    load(1, kw, categoryFilter, sort)
  }

  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val)
    load(1, keyword, val, sort)
  }

  const handleSortChange = (val: string) => {
    setSort(val)
    load(1, keyword, categoryFilter, val)
  }

  const handleDelete = async (record: SkillListItem) => {
    try {
      await deleteAdminSkill(record.skill_id)
      message.success(t('skill.success.deleted'))
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('skill.error.deleteFailed'))
    }
  }

  const handleDownload = async (record: SkillListItem) => {
    try {
      await downloadAdminSkillPackage(record.skill_id, record.file_name)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('skill.loadFailed'))
    }
  }

  const openDetail = (record: SkillListItem) => {
    setDetailId(record.skill_id)
    setDrawerOpen(true)
  }

  const openEdit = async (record: SkillListItem) => {
    // SkillFormModal edits the full SkillDetail (name/version/tags/… + the
    // upload→parse→reupload flow), so fetch the authoritative detail before
    // opening. A version-less/backfilled row still edits fine.
    const hide = message.loading(t('skill.editModal.loading'), 0)
    try {
      const detail = await getAdminSkill(record.skill_id)
      setEditSkill(detail)
      setEditOpen(true)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('skill.loadFailed'))
    } finally {
      hide()
    }
  }

  const getCategoryName = (catId: string) => {
    const cat = categories.find((c) => c.skill_category_id === catId)
    return cat?.name ?? catId
  }

  const columns: ColumnsType<SkillListItem> = [
    {
      title: t('skill.table.icon'),
      dataIndex: 'icon_url',
      key: 'icon',
      width: 60,
      render: (url: string) =>
        url ? (
          <img src={url} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: 4, background: '#f0f0f0' }} />
        ),
    },
    {
      title: t('skill.table.name'),
      dataIndex: 'name',
      key: 'name',
      width: 160,
      ellipsis: true,
    },
    {
      title: t('skill.table.category'),
      dataIndex: 'category_id',
      key: 'category',
      width: 120,
      render: (catId: string) => getCategoryName(catId),
    },
    {
      title: t('skill.table.tags'),
      dataIndex: 'tags',
      key: 'tags',
      width: 180,
      render: (tags: string[]) => (
        <Space size={[0, 4]} wrap>
          {(tags ?? []).slice(0, 3).map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
          {(tags ?? []).length > 3 && <Tag>+{tags.length - 3}</Tag>}
        </Space>
      ),
    },
    {
      title: t('common:pluginMetrics.rating'),
      dataIndex: 'rating',
      key: 'rating',
      width: 150,
      render: (rating: number | null, record) => (
        <PluginRating
          compact
          pluginId={record.skill_id}
          rating={rating}
          canEdit={canWrite}
          onChanged={(next) => {
            recordRatingOverride(ratingOverrides.current, record.skill_id, next)
            setRows((prev) => prev.map((row) =>
              row.skill_id === record.skill_id ? { ...row, rating: next } : row
            ))
          }}
        />
      ),
    },
    {
      title: t('skill.table.downloads'),
      dataIndex: 'download_count',
      key: 'downloads',
      width: 80,
      align: 'right',
    },
    {
      title: t('skill.table.views'),
      dataIndex: 'view_count',
      key: 'views',
      width: 80,
      align: 'right',
    },
    {
      title: t('skill.table.version'),
      dataIndex: 'version',
      key: 'version',
      width: 80,
    },
    {
      title: t('skill.table.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val: string) => (val ? new Date(val).toLocaleDateString() : '-'),
    },
    {
      title: t('table.visibility', { ns: 'common' }),
      key: 'visibility',
      width: 100,
      render: (_, record) => <VisibilityTag scope={record.scope} />,
    },
    {
      title: t('table.space', { ns: 'common' }),
      key: 'space',
      width: 140,
      ellipsis: true,
      render: (_, record) => nameOf(record.space_id),
    },
    {
      title: t('skill.table.actions'),
      key: 'actions',
      width: 200,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size="small" onClick={(event) => event.stopPropagation()}>
          <Button type="link" size="small" onClick={() => openDetail(record)}>
            {t('skill.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => handleDownload(record)}>
            {t('skill.download')}
          </Button>
          {canWrite && (
            <>
              <Button type="link" size="small" onClick={() => openEdit(record)}>
                {t('skill.edit')}
              </Button>
              <Popconfirm
                title={t('skill.deleteConfirm')}
                onConfirm={() => handleDelete(record)}
                okText={t('common:action.confirm')}
                cancelText={t('common:action.cancel')}
              >
                <Button type="link" size="small" danger>
                  {t('skill.delete')}
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Input
          placeholder={t('skill.search')}
          prefix={<SearchOutlined />}
          value={pendingKeyword}
          onChange={(e) => setPendingKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          value={categoryFilter}
          onChange={handleCategoryChange}
          style={{ width: 160 }}
          placeholder={t('skill.categoryFilter')}
        >
          <Select.Option value="">{t('skill.categoryAll')}</Select.Option>
          {categories.map((c) => (
            <Select.Option key={c.skill_category_id} value={c.skill_category_id}>
              {c.name}
            </Select.Option>
          ))}
        </Select>
        <Select value={sort} onChange={handleSortChange} style={{ width: 120 }}>
          <Select.Option value="latest">{t('skill.sortOptions.latest')}</Select.Option>
          <Select.Option value="downloads">{t('skill.sortOptions.downloads')}</Select.Option>
          <Select.Option value="views">{t('skill.sortOptions.views')}</Select.Option>
          <Select.Option value="comprehensive">{t('skill.sortOptions.comprehensive')}</Select.Option>
        </Select>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadOpen(true)}>
            {t('skill.upload')}
          </Button>
        )}
      </div>
      <Table
        rowKey="skill_id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          onChange: (p) => load(p, keyword, categoryFilter, sort),
          showSizeChanger: false,
        }}
        locale={{ emptyText: t('skill.empty') }}
        onRow={(record) => ({
          onClick: () => openDetail(record),
          style: { cursor: 'pointer' },
        })}
      />
      <SkillDetailDrawer
        open={drawerOpen}
        skillId={detailId}
        categories={categories}
        canEditRating={canWrite}
        onRatingChanged={(rating) => {
          if (detailId) recordRatingOverride(ratingOverrides.current, detailId, rating)
          setRows((prev) => prev.map((row) =>
            row.skill_id === detailId ? { ...row, rating } : row
          ))
        }}
        onClose={() => setDrawerOpen(false)}
      />
      <SkillFormModal
        open={editOpen}
        editSkill={editSkill}
        canWrite={canWrite}
        onClose={() => setEditOpen(false)}
        onSuccess={() => {
          setEditOpen(false)
          load()
        }}
      />
      <SkillUploadModal
        open={uploadOpen}
        categories={categories}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          setUploadOpen(false)
          load()
        }}
      />
    </div>
  )
}
