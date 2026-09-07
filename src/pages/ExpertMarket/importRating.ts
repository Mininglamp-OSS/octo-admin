export interface ImportThenRateResult {
  pluginId: string
  imported: boolean
  ratingFailed: boolean
}

/** A successful rating-only retry changed an existing row and therefore needs
 * the same list reconciliation as a fresh import. */
export function importResultNeedsReconcile(result: ImportThenRateResult): boolean {
  return result.imported || !result.ratingFailed
}

/** Run a container import followed by its optional rating write. A retry passes
 * the persisted plugin id, so only rating is retried and the plugin is never
 * imported twice. */
export async function importThenRate(
  pluginId: string | undefined,
  rating: number | null,
  importPlugin: () => Promise<{ plugin_id: string }>,
  setRating: (pluginId: string, rating: number) => Promise<void>,
): Promise<ImportThenRateResult> {
  const imported = pluginId === undefined
  const id = pluginId ?? (await importPlugin()).plugin_id
  if (rating === null) return { pluginId: id, imported, ratingFailed: false }
  try {
    await setRating(id, rating)
    return { pluginId: id, imported, ratingFailed: false }
  } catch {
    return { pluginId: id, imported, ratingFailed: true }
  }
}
