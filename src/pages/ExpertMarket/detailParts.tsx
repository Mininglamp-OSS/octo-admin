import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Modal, Skeleton, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import type { SkillRef } from '../../api/expert'

const { Text, Link } = Typography

export function DetailSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="exp-detail__section">
      <h4 className="exp-detail__section-title">{title}</h4>
      {children}
    </section>
  )
}

/** Read-only list of skills bundled on an expert or squad member. When
 *  `onView` is given, skills with stored content get a "view" link that
 *  opens the SKILL.md viewer. */
export function SkillRefList({
  skills,
  onView,
}: {
  skills: SkillRef[]
  onView?: (index: number, skill: SkillRef) => void
}) {
  const { t } = useTranslation(['expertMarket'])
  if (!skills?.length) return <Text type="secondary">{t('detail.noSkills')}</Text>
  return (
    <ul className="exp-list">
      {skills.map((s, i) => (
        <li className="exp-list__item" key={`${s.name}-${i}`}>
          <span className="exp-list__title">
            {s.name}
            {onView && s.has_content && (
              <Link onClick={() => onView(i, s)} style={{ marginLeft: 8, fontSize: 12 }}>
                {t('detail.viewSkill')}
              </Link>
            )}
          </span>
          {(s.file_name || s.can_download) && (
            <span className="exp-list__sub">
              {s.file_name}
              {typeof s.file_size === 'number' ? ` · ${formatBytes(s.file_size)}` : ''}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Fetch-and-show modal for one skill's stored SKILL.md text. `load` is
 *  called on each open; identity changes are ignored mid-flight. */
export function SkillMdModal({
  open,
  title,
  load,
  onClose,
}: {
  open: boolean
  title: string
  load: () => Promise<string>
  onClose: () => void
}) {
  const { t } = useTranslation(['expertMarket'])
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setContent(null)
    setError(null)
    let cancelled = false
    load()
      .then((c) => !cancelled && setContent(c))
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error)?.message ?? String(err))
      })
    return () => {
      cancelled = true
    }
    // `load` is a fresh closure every parent render; re-fetch only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Modal open={open} title={title} footer={null} onCancel={onClose} width={640}>
      {error ? (
        <Alert type="error" showIcon message={t('detail.skillLoadFailed')} description={error} />
      ) : content === null ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <pre className="exp-pre" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          {content}
        </pre>
      )}
    </Modal>
  )
}

/** Render an mcp_config JSON string, pretty-printed when parseable. */
export function McpConfigBlock({ config }: { config: string }) {
  let text = config
  try {
    text = JSON.stringify(JSON.parse(config), null, 2)
  } catch {
    /* show raw when not valid JSON */
  }
  return <pre className="exp-pre">{text}</pre>
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
