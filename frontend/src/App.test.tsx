import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { ROUTES } from './routes'
import { TEST_USER } from './test/render'

// Keep the real module and swap only what talks to the network: Register.tsx
// imports ACCOUNT_TYPES from here, and a wholesale replacement would strip it.
vi.mock('./api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/auth')>()),
  fetchCurrentUser: vi.fn(),
  logout: vi.fn(),
}))
vi.mock('./api/dashboard', () => ({ fetchHomeDashboard: vi.fn(() => new Promise(() => {})) }))
vi.mock('./api/diary', () => ({
  fetchTodayEntry: vi.fn(() => new Promise(() => {})),
  saveTodayEntry: vi.fn(),
}))

const { fetchCurrentUser } = await import('./api/auth')
const mockedFetchUser = vi.mocked(fetchCurrentUser)

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => mockedFetchUser.mockReset())

describe('guarded routes wait for the session answer', () => {
  it('shows neither the screen nor the login page while /api/auth/me/ is in flight', async () => {
    // A reload would otherwise bounce a logged-in patient to /login before the
    // answer arrives — the bug this guard exists to prevent.
    mockedFetchUser.mockReturnValueOnce(new Promise(() => {}))

    const { container } = renderAt(ROUTES.home)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Zaloguj/i })).not.toBeInTheDocument()
  })

  it('sends a visitor to the login page', async () => {
    mockedFetchUser.mockResolvedValueOnce(null)

    renderAt(ROUTES.diaryEntry)

    // findBy* retries: the guard renders its placeholder first, then swaps in
    // the redirect once /api/auth/me/ resolves.
    expect(await screen.findByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
  })

  it('lets a signed-in patient through to the entry form', async () => {
    mockedFetchUser.mockResolvedValueOnce(TEST_USER)

    renderAt(ROUTES.diaryEntry)

    expect(await screen.findByRole('status')).toHaveTextContent('Wczytywanie')
  })
})

describe('guest-only routes', () => {
  it('keeps a visitor on the login page', async () => {
    mockedFetchUser.mockResolvedValueOnce(null)

    renderAt(ROUTES.login)

    expect(await screen.findByLabelText(/e-mail/i)).toBeInTheDocument()
  })

  it('pushes a signed-in user off the login page to the module chooser', async () => {
    mockedFetchUser.mockResolvedValueOnce(TEST_USER)

    renderAt(ROUTES.login)

    await waitFor(() => expect(screen.queryByLabelText(/hasło/i)).not.toBeInTheDocument())
  })

  it('waits before deciding, rather than flashing the login form', async () => {
    mockedFetchUser.mockReturnValueOnce(new Promise(() => {}))

    const { container } = renderAt(ROUTES.login)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByLabelText(/hasło/i)).not.toBeInTheDocument()
  })
})

describe('a minor account with no guardian', () => {
  const UNLINKED_MINOR = { ...TEST_USER, isChild: true, guardianStatus: 'none' as const }

  it('is sent to the linking form from any other screen', async () => {
    mockedFetchUser.mockResolvedValueOnce(UNLINKED_MINOR)

    renderAt(ROUTES.diaryEntry)

    expect(await screen.findByLabelText(/adres e-mail rodzica/i)).toBeInTheDocument()
  })

  it('reaches the linking form directly', async () => {
    mockedFetchUser.mockResolvedValueOnce(UNLINKED_MINOR)

    renderAt(ROUTES.linkGuardian)

    expect(await screen.findByRole('heading', { name: /Powiąż konto/i })).toBeInTheDocument()
  })

  it('keeps a minor on the linking screen while the invitation is unanswered', async () => {
    // Being named is not consenting: a pending invitation must not unblock the
    // app, and the screen has to say what is being waited for.
    mockedFetchUser.mockResolvedValueOnce({
      ...TEST_USER, isChild: true, guardianStatus: 'pending' as const,
    })

    renderAt(ROUTES.home)

    expect(await screen.findByRole('heading', { name: /czeka na odpowiedź/i })).toBeInTheDocument()
  })

  it('waits for the session before deciding, rather than flashing the form', async () => {
    mockedFetchUser.mockReturnValueOnce(new Promise(() => {}))

    const { container } = renderAt(ROUTES.linkGuardian)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByLabelText(/adres e-mail rodzica/i)).not.toBeInTheDocument()
  })
})

describe('the linking form is only for accounts that need it', () => {
  it('pushes a linked minor off it', async () => {
    mockedFetchUser.mockResolvedValueOnce({
      ...TEST_USER, isChild: true, guardianStatus: 'accepted' as const,
    })

    renderAt(ROUTES.linkGuardian)

    await waitFor(() =>
      expect(screen.queryByLabelText(/adres e-mail rodzica/i)).not.toBeInTheDocument(),
    )
    expect(await screen.findByRole('heading', { name: /Gdzie dzisiaj zaczynamy/i })).toBeInTheDocument()
  })

  it('pushes an adult patient off it', async () => {
    mockedFetchUser.mockResolvedValueOnce(TEST_USER)

    renderAt(ROUTES.linkGuardian)

    await waitFor(() =>
      expect(screen.queryByLabelText(/adres e-mail rodzica/i)).not.toBeInTheDocument(),
    )
  })

  it('sends a visitor to login rather than to the linking form', async () => {
    mockedFetchUser.mockResolvedValueOnce(null)

    renderAt(ROUTES.linkGuardian)

    expect(await screen.findByLabelText(/hasło/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/adres e-mail rodzica/i)).not.toBeInTheDocument()
  })
})
