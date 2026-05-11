// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Octo Contributors

import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/auth'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.token = token
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ msg?: string }>) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/admin/login'
    }
    const message = error.response?.data?.msg || error.message
    return Promise.reject(new Error(message))
  }
)

export default api
