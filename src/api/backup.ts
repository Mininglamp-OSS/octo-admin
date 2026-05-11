// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Octo Contributors

import api from './index'

export interface BackupConfig {
  enabled: boolean
  prefix: string
  cron_expr: string
  retention_count: number
  data_dir: string
  // 只读的系统 COS 配置
  storage_type: string
  bucket: string
  region: string
}

export interface BackupConfigReq {
  enabled?: boolean
  prefix?: string
  cron_expr?: string
  retention_count?: number
  data_dir?: string
}

export interface BackupHistory {
  id: number
  backup_id: string
  status: string
  file_name: string
  file_size: number
  file_size_str: string
  storage_path: string
  started_at: string
  finished_at: string
  error_message: string
  created_at: string
}

export const getBackupConfig = () =>
  api.get<BackupConfig>('/v1/manager/backup/config').then((res) => res.data)

export const updateBackupConfig = (config: BackupConfigReq) =>
  api.put('/v1/manager/backup/config', config)

export const testBackupConnection = () =>
  api.post('/v1/manager/backup/config/test')

export const triggerBackup = () =>
  api.post<{ backup_id: string; message: string }>('/v1/manager/backup/trigger').then((res) => res.data)

export const getBackupHistory = (page: number = 1, pageSize: number = 20) =>
  api.get<{ list: BackupHistory[]; count: number }>('/v1/manager/backup/history', {
    params: { page_index: page, page_size: pageSize },
  }).then((res) => res.data)

export const deleteBackupHistory = (id: number) =>
  api.delete(`/v1/manager/backup/history/${id}`)

export const getBackupDownloadURL = (id: number) =>
  api.get<{ url: string }>(`/v1/manager/backup/history/${id}/download`).then((res) => res.data)

export const getBackupStatus = () =>
  api.get<{ is_running: boolean; next_run: string }>('/v1/manager/backup/status').then((res) => res.data)
