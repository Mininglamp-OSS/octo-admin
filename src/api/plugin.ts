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
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new RangeError('rating must be an integer from 1 to 5, or null')
  }
  await marketplaceApi.patch(
    `/admin/plugins/${encodeURIComponent(pluginId)}/rating`,
    { rating }
  )
}
