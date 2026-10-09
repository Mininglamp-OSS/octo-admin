import type { Key } from 'react'

export const MAX_PLACEMENT_SELECTION = 100

export function getChangedPlacementKeyword(pendingKeyword: string, currentKeyword: string): string | null {
  const nextKeyword = pendingKeyword.trim()
  return nextKeyword === currentKeyword ? null : nextKeyword
}

export function limitPlacementSelection(keys: Key[], onLimit: () => void): Key[] {
  if (keys.length <= MAX_PLACEMENT_SELECTION) return keys
  onLimit()
  return keys.slice(0, MAX_PLACEMENT_SELECTION)
}
