import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSpace } from '../api/space'

/**
 * Resolve a plugin's owning Space id to a human-readable label for the admin
 * list "所属空间" column.
 *
 * Public/system plugins carry an empty `space_id` and render as "全局 / Global".
 * Space/private plugins carry a Space UUID that this hook resolves to the Space
 * name by fetching it ON DEMAND per distinct id (GET /v1/manager/spaces/{id} on
 * octo-server, separate from the marketplace), cached and de-duplicated. Per-id
 * resolution is used instead of a bulk list so it reliably resolves any real
 * Space regardless of pagination or enabled/disabled status; a genuine
 * non-existent id (e.g. a local test seed) 404s and falls back to the raw id so
 * the column never blocks the table.
 */

export interface SpaceNameMap {
  nameOf: (spaceId?: string) => string
  loading: boolean
}

export function useSpaceNameMap(): SpaceNameMap {
  const { t } = useTranslation('common')
  // Resolved names: id → name (""), where "" marks a resolved-but-unknown id
  // (404/error) so we stop re-requesting it and fall back to showing the id.
  const [names, setNames] = useState<Map<string, string>>(() => new Map())
  const requested = useRef<Set<string>>(new Set())

  const resolve = useCallback((id: string) => {
    if (requested.current.has(id)) return
    requested.current.add(id)
    getSpace(id)
      .then((s) => setNames((m) => new Map(m).set(id, s?.name || '')))
      .catch(() => setNames((m) => new Map(m).set(id, '')))
  }, [])

  return useMemo(() => {
    const globalLabel = t('space.global')
    return {
      loading: false,
      nameOf: (spaceId?: string) => {
        if (!spaceId) return globalLabel
        if (names.has(spaceId)) {
          // Resolved: a real name, or "" (unknown) → show the raw id.
          return names.get(spaceId) || spaceId
        }
        // Not yet resolved: kick off the lazy fetch and show the id until it
        // lands (the fetch triggers a re-render). Deduped by `requested`.
        resolve(spaceId)
        return spaceId
      },
    }
  }, [names, t, resolve])
}

export default useSpaceNameMap
