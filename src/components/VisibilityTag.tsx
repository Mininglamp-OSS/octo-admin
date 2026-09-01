import { Tag } from 'antd'
import { useTranslation } from 'react-i18next'

/**
 * Renders the unified-plugin visibility scope (`system` / `space` / `private`)
 * as a colored antd Tag with an i18n label. A legacy incoming `public` scope is
 * normalized to `system` (the backend folded public into system), and any
 * unknown scope falls back to the raw string with no color. Labels live in the
 * shared `common` namespace (`visibility.*`), so every admin list table renders
 * the scope identically.
 */
const SCOPE_COLOR: Record<string, string | undefined> = {
  system: 'blue',
  space: 'orange',
  // `private` uses the default Tag styling (no preset color).
  private: undefined,
}

export default function VisibilityTag({ scope }: { scope: string }) {
  const { t } = useTranslation('common')
  // Legacy `public` folded into `system`; normalize so any stray old value
  // renders as the system tag rather than a bare fallback.
  const normalized = scope === 'public' ? 'system' : scope
  if (!(normalized in SCOPE_COLOR)) return <Tag>{normalized}</Tag>
  return <Tag color={SCOPE_COLOR[normalized]}>{t(`visibility.${normalized}`)}</Tag>
}
