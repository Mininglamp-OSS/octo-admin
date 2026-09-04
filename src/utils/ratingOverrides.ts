export type RatingOverrideMap = Map<string, number | null>

/**
 * Record a locally committed rating before updating the visible rows. Keeping
 * this separate from the current page means a later list response cannot
 * restore a stale server snapshot.
 */
export function recordRatingOverride(
  overrides: RatingOverrideMap,
  id: string,
  rating: number | null,
): void {
  overrides.set(id, rating)
}

/**
 * Merge server-owned list results with locally committed rating mutations.
 *
 * An override is retained while the server still returns an older value and is
 * removed once a response confirms the mutation. Only matching rows' ratings
 * are changed: search and pagination results (including their order and all
 * other fields) remain exactly as returned by the server.
 */
export function mergeRatingOverrides<T extends { rating: number | null }>(
  items: T[],
  overrides: RatingOverrideMap,
  getId: (item: T) => string,
): T[] {
  return items.map((item) => {
    const id = getId(item)
    if (!overrides.has(id)) return item

    const rating = overrides.get(id)!
    if (item.rating === rating) {
      overrides.delete(id)
      return item
    }
    return { ...item, rating }
  })
}
