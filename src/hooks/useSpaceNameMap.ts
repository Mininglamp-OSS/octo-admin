import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api'
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
 * Space regardless of pagination or enabled/disabled status. While a name is
 * loading, after a permanent miss, or after bounded transient retries are
 * exhausted, the UI deliberately renders "--" instead of exposing the
 * internal Space id as user-facing content.
 *
 * `nameOf` is called from table `render` callbacks (the render phase). It must
 * NOT fire a fetch there: under StrictMode/concurrent rendering an abandoned
 * render that already issued a request + marked the id `requested` would leave
 * that id permanently unresolved. Instead `nameOf` only RECORDS the observed id
 * (a ref mutation), and a post-commit `useEffect` issues the fetches — effects
 * run only for committed renders, so an abandoned render never strands an id.
 *
 * The fetch effect is intentionally dependency-less: it re-runs after every
 * commit to pick up newly observed ids, and `requested` de-dupes concurrent
 * requests. Transient failures get one bounded retry; 404s are permanent.
 * Because the effect re-runs per render, its resolutions are
 * guarded by a MOUNT-LIFETIME `mountedRef` — NOT a per-effect `alive` flag. A
 * per-effect cleanup would flip `alive=false` on every re-render, so when the
 * first of two concurrent Space fetches resolved (triggering a re-render), the
 * cleanup would cancel the second still-in-flight fetch; since its id already
 * sits in `requested` it would never be re-issued, stranding every-but-one
 * Space name on its raw UUID. `mountedRef` invalidates ONLY on unmount, so a
 * per-render re-run never drops a live resolution.
 */

export interface SpaceNameValue {
  label: string
  resolved: boolean
}

export interface SpaceNameMap {
  nameOf: (spaceId?: string) => SpaceNameValue
  loading: boolean
}

const MAX_LOOKUP_ATTEMPTS = 2

export function useSpaceNameMap(): SpaceNameMap {
  const { t } = useTranslation('common')
  // Resolved names: id → name, where null marks a permanent miss or an
  // exhausted transient lookup. Keeping that state separate from the rendered
  // label means a legitimate organization named "--" remains real data.
  const [names, setNames] = useState<Map<string, string | null>>(() => new Map())
  // Ids seen during render (recorded, not fetched, in the render phase) and ids
  // a fetch is currently or permanently accounted for (de-dupe). Both are refs so touching
  // them during render never schedules a state update.
  const observed = useRef<Set<string>>(new Set())
  const requested = useRef<Set<string>>(new Set())
  const attempts = useRef<Map<string, number>>(new Map())
  const [, triggerRetry] = useState(0)

  // Mount-lifetime flag: true while this component is mounted. Guards the
  // async resolutions below so a fetch that lands after unmount is dropped,
  // while a per-render re-run of the fetch effect never cancels an in-flight
  // request. Set from a SEPARATE unmount-only effect (empty deps) so it flips
  // false exactly once, on unmount — see the header note on why a per-effect
  // `alive` flag stranded concurrent fetches.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Resolve any observed-but-unrequested ids AFTER commit. Runs after every
  // render and self-limits via `requested`, so only committed renders trigger a
  // fetch and each id has at most one in-flight request. No per-effect cleanup: a fetch
  // stays live across re-renders and is only ignored once the hook unmounts
  // (mountedRef), so the first resolution's re-render can't drop a sibling
  // fetch that is still in flight.
  useEffect(() => {
    const pending: string[] = []
    observed.current.forEach((id) => {
      if (!requested.current.has(id)) {
        requested.current.add(id)
        attempts.current.set(id, (attempts.current.get(id) ?? 0) + 1)
        pending.push(id)
      }
    })
    if (pending.length === 0) return
    for (const id of pending) {
      getSpace(id)
        .then((s) => {
          if (!mountedRef.current) return
          const name = s?.name?.trim()
          setNames((m) => new Map(m).set(id, name || null))
        })
        .catch((error: unknown) => {
          if (!mountedRef.current) return
          if (error instanceof ApiError && error.status === 404) {
            setNames((m) => new Map(m).set(id, null))
            return
          }
          if ((attempts.current.get(id) ?? 0) < MAX_LOOKUP_ATTEMPTS) {
            requested.current.delete(id)
            triggerRetry((value) => value + 1)
            return
          }
          setNames((m) => new Map(m).set(id, null))
        })
    }
  })

  return useMemo(() => {
    const globalLabel = t('space.global')
    const unknownLabel = '--'
    return {
      loading: false,
      nameOf: (spaceId?: string) => {
        if (!spaceId) return { label: globalLabel, resolved: true }
        if (names.has(spaceId)) {
          const name = names.get(spaceId)
          return name
            ? { label: name, resolved: true }
            : { label: unknownLabel, resolved: false }
        }
        // Not yet resolved: record the id for the post-commit effect to fetch
        // (no fetch, no setState here — safe in the render phase). Keep the
        // internal id hidden while the name is loading.
        observed.current.add(spaceId)
        return { label: unknownLabel, resolved: false }
      },
    }
  }, [names, t])
}

export default useSpaceNameMap
