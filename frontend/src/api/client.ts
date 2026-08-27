/**
 * Fetch wrapper around the Django API.
 *
 * Two things every call needs and nobody should have to remember:
 * `credentials: 'include'`, because the session lives in an HttpOnly cookie that
 * JavaScript cannot see, let alone attach by hand; and the `X-CSRFToken` header
 * on anything that changes state, which Django compares against its own cookie.
 */

/** Empty (the default) means same-origin — see the /api proxy in vite.config.ts. */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

const CSRF_COOKIE = 'csrftoken'
const CSRF_HEADER = 'X-CSRFToken'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const GENERIC_ERROR = 'Coś poszło nie tak. Spróbuj ponownie.'
const NETWORK_ERROR = 'Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.'
const THROTTLED_ERROR = 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.'

export type FieldErrors = Record<string, string>

export class ApiError extends Error {
  readonly status: number
  /** Errors Django attributed to a single field, keyed by its API name. */
  readonly fieldErrors: FieldErrors
  /** The message to show above the form, or null when the fields say it all. */
  readonly formMessage: string | null

  constructor(status: number, formMessage: string | null, fieldErrors: FieldErrors = {}) {
    super(formMessage ?? GENERIC_ERROR)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.formMessage = formMessage
  }
}

/** In-memory fallback for the deployed case, where the API is on another site
 *  and its cookies are unreadable from here — see core.views.CsrfView. */
let cachedCsrfToken: string | null = null

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

async function getCsrfToken(forceRefresh: boolean): Promise<string | null> {
  if (!forceRefresh) {
    const existing = readCookie(CSRF_COOKIE) ?? cachedCsrfToken
    if (existing) return existing
  }

  const response = await fetch(`${BASE_URL}/api/auth/csrf/`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return null

  const payload = (await response.json()) as { csrf_token?: string }
  cachedCsrfToken = payload.csrf_token ?? null
  return readCookie(CSRF_COOKIE) ?? cachedCsrfToken
}

/** Django puts a field's messages in a list; take the first non-empty one. */
function firstMessage(value: unknown): string | null {
  if (typeof value === 'string') return value || null
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstMessage(item)
      if (message) return message
    }
  }
  return null
}

function toApiError(status: number, payload: unknown): ApiError {
  if (status === 429) return new ApiError(status, THROTTLED_ERROR)
  if (!payload || typeof payload !== 'object') return new ApiError(status, GENERIC_ERROR)

  const fieldErrors: FieldErrors = {}
  let formMessage: string | null = null

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const message = firstMessage(value)
    if (!message) continue
    // 'detail' and 'non_field_errors' are DRF's two ways of saying "this is
    // about the request, not about one input".
    if (key === 'detail' || key === 'non_field_errors') formMessage ??= message
    else fieldErrors[key] = message
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0
  return new ApiError(status, formMessage ?? (hasFieldErrors ? null : GENERIC_ERROR), fieldErrors)
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // An HTML error page from a proxy, or Django's debug traceback.
    return null
  }
}

/**
 * Fired when the API refuses a request for want of a session.
 *
 * An event rather than a callback into the router: this module knows about
 * fetch and cookies and should not learn about React state. It reports what the
 * server said and lets `AuthProvider` decide what it means — which matters,
 * because 403 is also the normal answer to `/api/auth/me/` for a visitor and
 * the answer to a stale CSRF token, and neither of those is an expired session.
 */
export const UNAUTHORIZED_EVENT = 'mediculus:unauthorized'

function reportUnauthorized(status: number) {
  if (status === 401 || status === 403) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options

  async function send(refreshCsrf: boolean) {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (!SAFE_METHODS.has(method)) {
      const token = await getCsrfToken(refreshCsrf)
      if (token) headers[CSRF_HEADER] = token
    }

    return fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  let response: Response
  try {
    response = await send(false)
    // A 403 on a state-changing call is nearly always a CSRF token the server
    // no longer recognises — it restarted, or the cookie expired. Worth one
    // silent retry with a freshly issued token before bothering the user.
    if (response.status === 403 && !SAFE_METHODS.has(method)) {
      response = await send(true)
    }
  } catch {
    // fetch only rejects when the request never got an answer.
    throw new ApiError(0, NETWORK_ERROR)
  }

  if (response.status === 204) return undefined as T

  const payload = await parseBody(response)
  if (!response.ok) {
    reportUnauthorized(response.status)
    throw toApiError(response.status, payload)
  }
  return payload as T
}

/**
 * A GET whose answer is a file rather than JSON.
 *
 * Separate from `apiRequest` rather than a flag on it: that function reads every
 * body with `text()` so an HTML page from a proxy cannot throw, and reading a
 * PDF that way corrupts it. A refusal still arrives as JSON, so failures go
 * through the same `toApiError` and land in the UI like any other — which is the
 * reason to fetch the file at all instead of pointing a plain link at the URL
 * and letting a 404 render as raw JSON in a new tab.
 */
export async function apiDownload(path: string): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/pdf' },
      credentials: 'include',
    })
  } catch {
    throw new ApiError(0, NETWORK_ERROR)
  }

  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = JSON.parse(await response.text())
    } catch {
      // Not JSON — toApiError falls back to its generic message.
    }
    reportUnauthorized(response.status)
    throw toApiError(response.status, payload)
  }

  return response.blob()
}
