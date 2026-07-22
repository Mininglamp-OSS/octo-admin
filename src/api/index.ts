import axios, { AxiosError } from 'axios'
import i18n, { FALLBACK_LANGUAGE } from '../i18n'
import { useAuthStore } from '../store/auth'

export class ApiError extends Error {
  status?: number
  code?: string
  details?: Record<string, unknown>
  constructor(message: string, status?: number, code?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

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
  config.headers['Accept-Language'] = i18n.resolvedLanguage ?? FALLBACK_LANGUAGE
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ msg?: string; error?: { code?: string; http_status?: number; message?: string } }>) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/admin/login'
    }
    const errorEnvelope = error.response?.data?.error
    const message = errorEnvelope?.message || error.response?.data?.msg || error.message
    const status = errorEnvelope?.http_status ?? error.response?.status
    return Promise.reject(new ApiError(message, status, errorEnvelope?.code))
  }
)

export default api
