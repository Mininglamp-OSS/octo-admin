/**
 * octo-marketplace shared axios client.
 *
 * Distinct from the shared `../api` axios instance because marketplace mounts
 * under `/market/api/v1` and returns its own response envelope. Auth uses the
 * caller's own Octo login token; marketplace verifies it with octo-server and
 * enforces superAdmin server-side. No marketplace administrator credential is
 * shipped to the browser.
 *
 * Wire contract (success):
 *   single item — `{ data: T }`
 *   list       — `{ data: T[], pagination: { total, page, page_size } }`
 * Wire contract (error):
 *   `{ error: { code, message, details } }`  (legacy: `{ err: {...} }`)
 *
 * Every marketplace resource client (mcp.ts, skill.ts, …) imports this
 * instance instead of re-declaring the same baseURL + auth + envelope
 * plumbing.
 */

import axios, { AxiosError, type AxiosInstance } from 'axios'
import i18n, { FALLBACK_LANGUAGE } from '../i18n'
import { ApiError } from './index'
import { useAuthStore } from '../store/auth'

const MARKETPLACE_BASE =
  import.meta.env.VITE_MARKETPLACE_API_BASE || '/market/api/v1'

export const marketplaceApi: AxiosInstance = axios.create({
  baseURL: MARKETPLACE_BASE,
  timeout: 30000,
})

marketplaceApi.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.token = token
  }
  config.headers['Accept-Language'] =
    i18n.resolvedLanguage ?? FALLBACK_LANGUAGE
  return config
})

marketplaceApi.interceptors.response.use(
  (response) => response,
  (
    error: AxiosError<{
      error?: { code?: string; message?: string; details?: Record<string, unknown> }
      err?: { code?: string; message?: string; details?: Record<string, unknown> }
    }>
  ) => {
    const wire = error.response?.data?.error ?? error.response?.data?.err
    const message = wire?.message || wire?.code || error.message
    // 401 from marketplace means the admin's Octo token expired or was
    // revoked at octo-server. Mirror the shared axios interceptor
    // (../api/index.ts) so the auth store clears and the user is bounced
    // to /login rather than left on a broken page firing more 401s.
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/admin/login'
    }
    return Promise.reject(
      new ApiError(message, error.response?.status, wire?.code, wire?.details)
    )
  }
)

/** Reject upload URLs the server never should have handed us. Presigned URLs
 *  should be https, with localhost/127.0.0.1 as the only http exception (dev
 *  proxy). Anything else — file://, javascript:, cross-origin http — is
 *  treated as an invalid server response and surfaced as an ApiError so it
 *  flows through the same error-handling path as any other 5xx. */
export function assertSafeExternalUrl(raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ApiError('Invalid upload URL', 502, 'invalid_response')
  }
  if (url.protocol === 'https:') return
  if (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  ) {
    return
  }
  throw new ApiError('Upload URL scheme is not allowed', 502, 'invalid_response')
}

/** In dev, marketplace's built-in storage presigns absolute URLs to its own
 *  host (http://127.0.0.1:8092/api/v1/_storage/…). The admin app runs on the
 *  Vite origin, so a direct PUT is cross-origin and the storage endpoint
 *  sends no CORS headers. Route those URLs through the `/market` dev proxy
 *  (the inverse of vite.config.ts's `/market` → strip rewrite) so the PUT is
 *  same-origin. Real OSS hosts (https) pass through untouched; prod serves
 *  everything behind one nginx origin so the rewrite never applies there. */
function toSameOriginUploadUrl(raw: string): string {
  if (!import.meta.env.DEV) return raw
  try {
    const url = new URL(raw)
    if (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.pathname.startsWith('/api/v1/_storage/')
    ) {
      return `/market${url.pathname}${url.search}`
    }
  } catch {
    // Not an absolute URL — let assertSafeExternalUrl report it.
  }
  return raw
}

/** PUT `file` bytes to a marketplace-issued presigned URL. Uses fetch (not
 *  the marketplace axios instance) because the presigned URL points at the
 *  local dev proxy or an OSS host — not the admin base URL — and we don't
 *  want the token / Accept-Language interceptors leaking into a third-party
 *  call. Errors become ApiError so upload flows share a single error type. */
export async function putPresignedFile(
  presignedUrl: string,
  file: File,
  options: { method?: string; headers?: Record<string, string> } = {}
): Promise<void> {
  assertSafeExternalUrl(presignedUrl)
  const putResp = await fetch(toSameOriginUploadUrl(presignedUrl), {
    method: options.method || 'PUT',
    headers: options.headers ?? {},
    body: file,
  })
  if (!putResp.ok) {
    throw new ApiError(`Upload failed (${putResp.status})`, putResp.status)
  }
}
