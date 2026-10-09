import { marketplaceApi } from './marketplace'

export interface PluginScene {
  scene_id: string
  scene_code: string
  name: string
  description: string
  sort_order: number
  plugin_count: number
  category_count: number
  created_at: string
  updated_at: string
}

export interface BatchPlacementParams {
  scene_code: string
  plugin_ids: string[]
  is_placed: boolean
}

export async function listPluginScenes(): Promise<PluginScene[]> {
  const response = await marketplaceApi.get<{ data: PluginScene[] }>('/admin/plugin_scenes')
  return response.data.data ?? []
}

export async function createPluginScene(payload: {
  scene_code: string
  name: string
  description: string
  sort_order: number
}): Promise<PluginScene> {
  const response = await marketplaceApi.post<{ data: PluginScene }>('/admin/plugin_scenes', payload)
  return response.data.data
}

export async function updatePluginScene(
  sceneId: string,
  payload: { name: string; description: string; sort_order: number },
): Promise<PluginScene> {
  const response = await marketplaceApi.patch<{ data: PluginScene }>(
    `/admin/plugin_scenes/${encodeURIComponent(sceneId)}`,
    payload,
  )
  return response.data.data
}

export async function deletePluginScene(sceneId: string): Promise<void> {
  await marketplaceApi.delete(`/admin/plugin_scenes/${encodeURIComponent(sceneId)}`)
}

export async function batchSetPluginPlacements(payload: BatchPlacementParams): Promise<void> {
  await marketplaceApi.post('/admin/plugin_placements/_batch', payload)
}
