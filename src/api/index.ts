import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/auth'

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
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
    return Promise.reject(new ApiError(message, error.response?.status))
  }
)

export default api
