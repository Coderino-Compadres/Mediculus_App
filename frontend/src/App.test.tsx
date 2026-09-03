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
vi.mock('./api/profile', () => ({ fetchAccountProfile: vi.fn(() => new Promise(() => {})) }))
vi.mock('./api/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/account')>()),
  restoreConsent: vi.fn(() => new Promise(() => {})),
}))
vi.mock('./api/guardian', () => ({
  fetchGuardianInvitations: vi.fn(() => Promise.resolve([])),
  fetchGuardianChildren: vi.fn(() => Promise.resolve([])),
  acceptGuardianInvitation: vi.fn(),
  rejectGuardianInvitation: vi.fn(),
}))
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

describe('a guardian account has its own view', () => {
  /**
   * A guardian gets no `patient` row at registration, so every screen behind
   * `_require_patient` answers them 403. They used to be dropped on the module
   * chooser regardless and offered a tile into the patient app, which then
   * failed on a refusal the screen could only word as "coś poszło nie tak".
   */
  const GUARDIAN = { ...TEST_USER, role: 'rodzic', isPatient: false, isChild: null }

  it('lands on the parent panel after logging in, not on the module chooser', async () => {
    mockedFetchUser.mockResolvedValueOnce(GUARDIAN)

    renderAt(ROUTES.login)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panel rodzica' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Gdzie dzisiaj zaczynamy/i })).toBeNull()
  })

  it('lands there from the bare address too', async () => {
    mockedFetchUser.mockResolvedValueOnce(GUARDIAN)

    renderAt('/')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panel rodzica' }),
    ).toBeInTheDocument()
  })

  it('is pushed off the patient app rather than shown a refusal', async () => {
    mockedFetchUser.mockResolvedValue(GUARDIAN)

    for (const route of [ROUTES.modules, ROUTES.home, ROUTES.journals, ROUTES.reports]) {
      const { unmount } = renderAt(route)
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Panel rodzica' }),
      ).toBeInTheDocument()
      unmount()
    }
  })

  it('keeps the profile, which is the one shared screen', async () => {
    /** Identity, the consent register (art. 7(3): withdrawing has to be as easy
     *  as consenting) and the password form all work for a guardian — only the
     *  clinical half of that screen is left out, by the screen itself. */
    mockedFetchUser.mockResolvedValueOnce(GUARDIAN)

    renderAt(ROUTES.profile)

    expect(await screen.findByRole('heading', { level: 1, name: 'Profil' })).toBeInTheDocument()
  })

  it('does not let a patient onto the parent panel', async () => {
    mockedFetchUser.mockResolvedValueOnce(TEST_USER)

    renderAt(ROUTES.parentHome)

    expect(
      await screen.findByRole('heading', { name: /Gdzie dzisiaj zaczynamy/i }),
    ).toBeInTheDocument()
  })

  it('sends a visitor on the parent panel to login, not to the panel', async () => {
    mockedFetchUser.mockResolvedValueOnce(null)

    renderAt(ROUTES.parentHome)

    expect(await screen.findByLabelText(/hasło/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Panel rodzica' })).toBeNull()
  })

  it('waits for the session before deciding, rather than flashing the panel', async () => {
    mockedFetchUser.mockReturnValueOnce(new Promise(() => {}))

    const { container } = renderAt(ROUTES.parentHome)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Panel rodzica' })).toBeNull()
  })
})

describe('an account whose consents are not in force', () => {
  /**
   * Withdrawing a consent locks the account rather than deleting it, and the
   * lock has to mean one screen and nothing else — the app has no lawful basis
   * to process anything for this account, so "nothing" cannot mean "the screens
   * somebody thought to check". `core/permissions.py` enforces the same thing on
   * the server; this is only about which screen gets drawn.
   */
  const LOCKED = {
    ...TEST_USER,
    consentsActive: false,
    dataConsentWithdrawnAt: '2026-09-01T10:00:00Z',
    servicesConsentWithdrawnAt: '2026-09-01T10:00:00Z',
  }

  const HEADING = /Bez zgód nie możemy prowadzić Twojego konta/

  it('is sent to the consent screen from every other route', async () => {
    mockedFetchUser.mockResolvedValue(LOCKED)

    for (const route of [
      ROUTES.home, ROUTES.modules, ROUTES.diaryEntry, ROUTES.journals,
      ROUTES.reports, ROUTES.analysis, ROUTES.techniques, ROUTES.safetyPlan,
      '/',
    ]) {
      const { unmount } = renderAt(route)
      expect(await screen.findByRole('heading', { name: HEADING })).toBeInTheDocument()
      unmount()
    }
  })

  it('is sent there from the profile too, which has no exemption from this gate', async () => {
    /** `/profile` opts out of the *guardian* redirect only. It is where a
     *  consent is withdrawn, and staying on it afterwards would leave the
     *  account looking at its own data with no basis to be shown it. */
    mockedFetchUser.mockResolvedValueOnce(LOCKED)

    renderAt(ROUTES.profile)

    expect(await screen.findByRole('heading', { name: HEADING })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Profil' })).toBeNull()
  })

  it('is sent there instead of to the login page it is already past', async () => {
    mockedFetchUser.mockResolvedValueOnce(LOCKED)

    renderAt(ROUTES.login)

    expect(await screen.findByRole('heading', { name: HEADING })).toBeInTheDocument()
  })

  it('reaches the consent screen directly', async () => {
    mockedFetchUser.mockResolvedValueOnce(LOCKED)

    renderAt(ROUTES.consents)

    expect(await screen.findByRole('heading', { name: HEADING })).toBeInTheDocument()
  })

  it('outranks the guardian gate for a minor who is behind both', async () => {
    /** The consent gate is the outer question — without a lawful basis there is
     *  nothing to process, whoever has or has not vouched for the account — and
     *  it is the only one of the two the owner can clear by themselves. */
    mockedFetchUser.mockResolvedValueOnce({
      ...LOCKED, isChild: true, guardianStatus: 'none' as const,
    })

    renderAt(ROUTES.home)

    expect(await screen.findByRole('heading', { name: HEADING })).toBeInTheDocument()
    expect(screen.queryByLabelText(/adres e-mail rodzica/i)).toBeNull()
  })

  it('sends a locked guardian to the consent screen, not to the parent panel', async () => {
    mockedFetchUser.mockResolvedValueOnce({
      ...LOCKED, role: 'rodzic', isPatient: false, isChild: null,
    })

    renderAt(ROUTES.parentHome)

    expect(await screen.findByRole('heading', { name: HEADING })).toBeInTheDocument()
  })

  it('waits for the session before deciding, rather than flashing the screen', async () => {
    mockedFetchUser.mockReturnValueOnce(new Promise(() => {}))

    const { container } = renderAt(ROUTES.consents)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: HEADING })).toBeNull()
  })
})

describe('the consent screen is only for accounts that need it', () => {
  it('pushes a consenting patient off it', async () => {
    mockedFetchUser.mockResolvedValueOnce(TEST_USER)

    renderAt(ROUTES.consents)

    expect(
      await screen.findByRole('heading', { name: /Gdzie dzisiaj zaczynamy/i }),
    ).toBeInTheDocument()
  })

  it('pushes a consenting guardian off it, to their own screen', async () => {
    mockedFetchUser.mockResolvedValueOnce({
      ...TEST_USER, role: 'rodzic', isPatient: false, isChild: null,
    })

    renderAt(ROUTES.consents)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panel rodzica' }),
    ).toBeInTheDocument()
  })

  it('sends a visitor to login rather than to the consent screen', async () => {
    mockedFetchUser.mockResolvedValueOnce(null)

    renderAt(ROUTES.consents)

    expect(await screen.findByLabelText(/hasło/i)).toBeInTheDocument()
  })
})
