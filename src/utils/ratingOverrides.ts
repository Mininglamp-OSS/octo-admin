export interface RatingOverride {
  rating: number | null
  sequence: number
}

export interface RatingOverrideLedger {
  sequence: number
  overrides: Map<string, RatingOverride>
}

export function createRatingOverrideLedger(): RatingOverrideLedger {
  return { sequence: 0, overrides: new Map() }
}

/** Record a locally committed rating with a process-local recency token. */
export function recordRatingOverride(
  ledger: RatingOverrideLedger,
  id: string,
  rating: number | null,
): void {
  ledger.sequence += 1
  ledger.overrides.set(id, { rating, sequence: ledger.sequence })
}

/** Capture this immediately before starting a list request. */
export function ratingOverrideSequence(ledger: RatingOverrideLedger): number {
  return ledger.sequence
}

/**
 * Reconcile a server response against mutations made while that request was in
 * flight. Overrides newer than the request win; older overrides are retired and
 * the response is authoritative, even when its value differs.
 */
export function mergeRatingOverrides<T extends { rating: number | null }>(
  items: T[],
  ledger: RatingOverrideLedger,
  seenSequence: number,
  getId: (item: T) => string,
): T[] {
  return items.map((item) => {
    const id = getId(item)
    const override = ledger.overrides.get(id)
    if (!override) return item

    if (override.sequence <= seenSequence) {
      ledger.overrides.delete(id)
      return item
    }
    return item.rating === override.rating ? item : { ...item, rating: override.rating }
  })
}
