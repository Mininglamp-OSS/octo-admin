import { marketplaceApi } from './marketplace'

export interface PluginMetrics {
  rating: number | null
  view_count: number
  install_count: number
  download_count: number
}

/** Update only the curated rating. This deliberately uses the dedicated route
 * instead of the full plugin PATCH, which replaces package metadata. */
export async function updatePluginRating(
  pluginId: string,
  rating: number | null
): Promise<void> {
  await marketplaceApi.patch(
    `/admin/plugins/${encodeURIComponent(pluginId)}/rating`,
    { rating }
  )
}

/** Best-effort helper for create/edit flows where the plugin write has already
 * committed. False means partial success and must not be reported as a failed
 * or retryable plugin creation. */
export async function tryUpdatePluginRating(
  pluginId: string,
  rating: number | null
): Promise<boolean> {
  try {
    await updatePluginRating(pluginId, rating)
    return true
  } catch {
    return false
  }
}
