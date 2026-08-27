import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError as ApiErrorType } from './client'

/**
 * client.ts keeps a module-level `cachedCsrfToken` — the fallback for a
 * deployment where the API's cookies are unreadable from here. That cache is
 * exactly what one test would leak into the next, so every test gets a freshly
 * imported module rather than a shared one.
 */
async function freshClient() {
  vi.resetModules()
  return import('./client')
}

/** A fetch Response stand-in.
 *
 * Both `text()` and `json()` are needed: apiRequest reads bodies with text() so
 * that an HTML error page from a proxy does not blow up, while getCsrfToken
 * calls json() directly. A stub with only one of them makes the CSRF fetch throw
 * and surfaces as a bogus "network error" three frames away.
 */
function respond(status: number, body: unknown, contentType = 'application/json') {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ 'Content-Type': contentType }),
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response
}

const CSRF = { csrf_token: 'token-z-body' }

function mockFetch() {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let apiRequest: (typeof import('./client'))['apiRequest']
let ApiError: (typeof import('./client'))['ApiError']

beforeEach(async () => {
  // Each test starts with no csrftoken cookie so the token has to be fetched.
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  const mod = await freshClient()
  apiRequest = mod.apiRequest
  ApiError = mod.ApiError
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiRequest — the parts every call depends on', () => {
  it('sends the session cookie on every request', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respond(200, { ok: true }))

    await apiRequest('/api/auth/me/')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' })
  })

  it('does not ask for a CSRF token on a safe method', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respond(200, {}))

    await apiRequest('/api/dashboard/home/')

    // One call only: no trip to /api/auth/csrf/.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].headers['X-CSRFToken']).toBeUndefined()
  })

  it('fetches a CSRF token before an unsafe method and sends it back', async () => {
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(respond(200, CSRF))          // GET /api/auth/csrf/
      .mockResolvedValueOnce(respond(200, { saved: true })) // the PUT itself

    await apiRequest('/api/diary/today/', { method: 'PUT', body: { mood: 'good' } })

    expect(fetchMock.mock.calls[0][0]).toContain('/api/auth/csrf/')
    expect(fetchMock.mock.calls[1][1].headers['X-CSRFToken']).toBe('token-z-body')
  })

  it('reads the token from the cookie when there is one, without a round trip', async () => {
    document.cookie = 'csrftoken=token-z-ciastka; path=/'
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respond(200, {}))

    await apiRequest('/api/auth/logout/', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].headers['X-CSRFToken']).toBe('token-z-ciastka')
  })

  it('retries an unsafe call once with a fresh token after a 403', async () => {
    // The server restarting invalidates the token the browser holds; one silent
    // retry is cheaper than making the user re-submit the form.
    document.cookie = 'csrftoken=nieaktualny; path=/'
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(respond(403, { detail: 'CSRF failed' })) // first attempt
      // GET /api/auth/csrf/ is decorated with ensure_csrf_cookie, so the real
      // response replaces the cookie as well as returning the token.
      .mockImplementationOnce(async () => {
        document.cookie = 'csrftoken=swiezy-z-ciastka; path=/'
        return respond(200, CSRF)
      })
      .mockResolvedValueOnce(respond(200, { saved: true })) // retry

    const result = await apiRequest<{ saved: boolean }>('/api/diary/today/', { method: 'PUT' })

    expect(result).toEqual({ saved: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][1].headers['X-CSRFToken']).toBe('nieaktualny')
    expect(fetchMock.mock.calls[2][1].headers['X-CSRFToken']).toBe('swiezy-z-ciastka')
  })

  it('falls back to the token in the body when the cookie is unreadable', async () => {
    // The deployed case: frontend on another site, so document.cookie never
    // shows the API's cookie even though the browser still sends it.
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(respond(200, CSRF))
      .mockResolvedValueOnce(respond(200, { saved: true }))

    await apiRequest('/api/diary/today/', { method: 'PUT' })

    expect(fetchMock.mock.calls[1][1].headers['X-CSRFToken']).toBe('token-z-body')
  })

  it('gives up after one retry instead of looping on a persistent 403', async () => {
    // With a cookie in hand the first fetch is the PUT itself, not a token trip.
    document.cookie = 'csrftoken=nieaktualny; path=/'
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(respond(403, { detail: 'CSRF failed' }))
      .mockResolvedValueOnce(respond(200, CSRF))
      .mockResolvedValueOnce(respond(403, { detail: 'CSRF failed' }))

    await expect(apiRequest('/api/diary/today/', { method: 'PUT' })).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry a 403 on a safe method — that one means "not logged in"', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respond(403, { detail: 'Nie podano danych.' }))

    await expect(apiRequest('/api/auth/me/')).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns undefined for 204 rather than trying to parse an empty body', async () => {
    document.cookie = 'csrftoken=t; path=/'
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respond(204, undefined))

    await expect(apiRequest('/api/auth/logout/', { method: 'POST' })).resolves.toBeUndefined()
  })
})

describe('apiRequest — how failures reach the UI', () => {
  it('splits DRF field errors from the message that belongs above the form', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(
      respond(400, { email: ['Ten adres jest zajęty.'], detail: 'Popraw formularz.' }),
    )

    const error = await apiRequest('/api/auth/register/').catch((e: unknown) => e as ApiErrorType)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiErrorType).fieldErrors).toEqual({ email: 'Ten adres jest zajęty.' })
    expect((error as ApiErrorType).formMessage).toBe('Popraw formularz.')
  })

  it("treats non_field_errors as a form-level message, like DRF means it", async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respond(400, { non_field_errors: ['Hasła nie pasują.'] }))

    const error = (await apiRequest('/api/auth/register/').catch((e) => e)) as ApiErrorType

    expect(error.formMessage).toBe('Hasła nie pasują.')
    expect(error.fieldErrors).toEqual({})
  })

  it('takes the first message when Django sends a list', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respond(400, { password: ['Za krótkie.', 'Zbyt popularne.'] }))

    const error = (await apiRequest('/api/auth/register/').catch((e) => e)) as ApiErrorType

    expect(error.fieldErrors.password).toBe('Za krótkie.')
  })

  it('has its own wording for a throttle, which carries no useful body', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respond(429, { detail: 'Request was throttled.' }))

    const error = (await apiRequest('/api/auth/login/').catch((e) => e)) as ApiErrorType

    expect(error.status).toBe(429)
    expect(error.formMessage).toContain('Zbyt wiele prób')
  })

  it('survives an HTML error page from a proxy instead of throwing a parse error', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respond(502, '<html>Bad Gateway</html>', 'text/html'))

    const error = (await apiRequest('/api/auth/me/').catch((e) => e)) as ApiErrorType

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.formMessage).toContain('Coś poszło nie tak')
  })

  it('reports a request that never got an answer as a network problem, not a 500', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const error = (await apiRequest('/api/auth/me/').catch((e) => e)) as ApiErrorType

    expect(error.status).toBe(0)
    expect(error.formMessage).toContain('połączyć z serwerem')
  })
})

describe('apiDownload', () => {
  /** A binary Response: no text() in the success path, because reading a PDF
   *  that way is what corrupts it — which is the whole reason this function is
   *  separate from apiRequest. */
  function respondWithFile(status: number, body: unknown) {
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers({ 'Content-Type': 'application/pdf' }),
      text: async () => text,
      blob: async () => new Blob(['%PDF-'], { type: 'application/pdf' }),
    } as unknown as Response
  }

  it('returns the body as a blob rather than as text', async () => {
    const { apiDownload } = await freshClient()
    mockFetch().mockResolvedValueOnce(respondWithFile(200, undefined))

    const blob = await apiDownload('/api/reports/week-2026-08-03/pdf/')

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
  })

  it('sends the session cookie, or the server has no idea whose report it is', async () => {
    const { apiDownload } = await freshClient()
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(respondWithFile(200, undefined))

    await apiDownload('/api/reports/week-2026-08-03/pdf/')

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' })
  })

  it('turns a refusal into the same ApiError every other call throws', async () => {
    const { apiDownload, ApiError: Err } = await freshClient()
    // Not Once: the assertion below calls it a second time.
    mockFetch().mockResolvedValue(
      respondWithFile(404, { detail: 'Nie znaleziono raportu dla tego tygodnia.' }),
    )

    await expect(apiDownload('/api/reports/week-1999-01-04/pdf/')).rejects.toMatchObject({
      status: 404,
      formMessage: 'Nie znaleziono raportu dla tego tygodnia.',
    })
    await expect(apiDownload('/api/reports/week-1999-01-04/pdf/')).rejects.toBeInstanceOf(Err)
  })

  it('survives a failure whose body is not JSON at all', async () => {
    const { apiDownload } = await freshClient()
    mockFetch().mockResolvedValue(respondWithFile(502, '<html>Bad gateway</html>'))

    await expect(apiDownload('/api/reports/week-2026-08-03/pdf/')).rejects.toMatchObject({
      status: 502,
    })
  })

  it('reports a request that never got an answer as a network failure', async () => {
    const { apiDownload } = await freshClient()
    mockFetch().mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(apiDownload('/api/reports/week-2026-08-03/pdf/')).rejects.toMatchObject({
      status: 0,
    })
  })
})
