import { useEffect, useMemo, useRef, useState } from 'react'
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
 *
 * `nameOf` is called from table `render` callbacks (the render phase). It must
 * NOT fire a fetch there: under StrictMode/concurrent rendering an abandoned
 * render that already issued a request + marked the id `requested` would leave
 * that id permanently unresolved. Instead `nameOf` only RECORDS the observed id
 * (a ref mutation), and a post-commit `useEffect` issues the fetches — effects
 * run only for committed renders, so an abandoned render never strands an id.
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
  // Ids seen during render (recorded, not fetched, in the render phase) and ids
  // a fetch has already been issued for (de-dupe). Both are refs so touching
  // them during render never schedules a state update.
  const observed = useRef<Set<string>>(new Set())
  const requested = useRef<Set<string>>(new Set())

  // Resolve any observed-but-unrequested ids AFTER commit. Runs after every
  // render and self-limits via `requested`, so only committed renders trigger a
  // fetch and each id is fetched at most once.
  useEffect(() => {
    const pending: string[] = []
    observed.current.forEach((id) => {
      if (!requested.current.has(id)) {
        requested.current.add(id)
        pending.push(id)
      }
    })
    if (pending.length === 0) return
    let alive = true
    for (const id of pending) {
      getSpace(id)
        .then((s) => {
          if (alive) setNames((m) => new Map(m).set(id, s?.name || ''))
        })
        .catch(() => {
          if (alive) setNames((m) => new Map(m).set(id, ''))
        })
    }
    return () => {
      alive = false
    }
  })

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
        // Not yet resolved: record the id for the post-commit effect to fetch
        // (no fetch, no setState here — safe in the render phase). Show the id
        // until the name lands (the resolve triggers a re-render).
        observed.current.add(spaceId)
        return spaceId
      },
    }
  }, [names, t])
}

export default useSpaceNameMap
