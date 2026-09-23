import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import ConsentsRequired from './ConsentsRequired'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import { CONSENTS } from '../utils/consents'
import type { AuthUser } from '../api/auth'

vi.mock('../api/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account')>()
  return { ...actual, restoreConsent: vi.fn() }
})
const { restoreConsent } = await import('../api/account')
const mockedRestore = vi.mocked(restoreConsent)

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

const GRANTED = '2026-06-18T09:31:02Z'
const WITHDRAWN = '2026-09-01T10:00:00Z'

/** Both consents withdrawn — the account this screen exists for. */
const LOCKED: AuthUser = {
  ...TEST_USER,
  consents: {
    active: false,
    data: { grantedAt: GRANTED, withdrawnAt: WITHDRAWN, active: false },
    services: { grantedAt: GRANTED, withdrawnAt: WITHDRAWN, active: false },
  },
}

/** Only the services one gone. Still locked: the app needs both. */
const HALF_LOCKED: AuthUser = {
  ...TEST_USER,
  consents: {
    active: false,
    data: { grantedAt: GRANTED, withdrawnAt: null, active: true },
    services: { grantedAt: GRANTED, withdrawnAt: WITHDRAWN, active: false },
  },
}

/**
 * The shape that caused the reported bug: withdrawn *after* being granted, but
 * rendered so that a string comparison says otherwise. The screen must still
 * offer the consent back.
 */
const LOCKED_MIXED_ZONES: AuthUser = {
  ...TEST_USER,
  consents: {
    active: false,
    data: {
      grantedAt: '2026-09-03T12:53:33.632094+02:00',
      withdrawnAt: '2026-09-03T10:53:33.842499Z',
      active: false,
    },
    services: {
      grantedAt: '2026-09-03T12:53:33.632094+02:00',
      withdrawnAt: '2026-09-03T10:53:33.842499Z',
      active: false,
    },
  },
}

/**
 * A brand-new account: no consent was ever granted, so neither was withdrawn.
 *
 * `core/colleagues.py` creates exactly this — a specialist account made by a
 * colleague, with no consent timestamps, because nobody may consent on
 * somebody else's behalf (art. 7). `has_active_consents` treats it like a
 * withdrawal and sends it to this screen, which is right for the gate and wrong
 * for every sentence the screen used to say to it.
 */
const NEVER_GRANTED: AuthUser = {
  ...TEST_USER,
  consents: {
    active: false,
    data: { grantedAt: null, withdrawnAt: null, active: false },
    services: { grantedAt: null, withdrawnAt: null, active: false },
  },
}

const RESTORED: AuthUser = { ...TEST_USER }

beforeEach(() => {
  navigate.mockReset()
  mockedRestore.mockReset()
  mockedRestore.mockResolvedValue(RESTORED)
})

/** Typed as AuthUser rather than inferred from LOCKED, whose withdrawal dates
 *  are strings — HALF_LOCKED has a null among them. */
function render(
  user: AuthUser = LOCKED,
  options: Parameters<typeof renderWithProviders>[1] = {},
) {
  return renderWithProviders(<ConsentsRequired />, { user, route: ROUTES.consents, ...options })
}

describe('ConsentsRequired — what it says', () => {
  it('explains that the account is stopped without the consents', async () => {
    render()

    expect(
      screen.getByRole('heading', { name: /Bez zgód nie możemy prowadzić Twojego konta/ }),
    ).toBeInTheDocument()
  })

  it('says plainly that nothing was deleted', async () => {
    /** The single most important sentence here. The older model equated
     *  withdrawal with deletion, and somebody arriving from that wording needs
     *  to know their diary is still there before anything else. */
    render()

    expect(screen.getByText(/Nic nie zostało usunięte/)).toBeInTheDocument()
    expect(screen.getByText(/wrócą w tym samym stanie|czekają na miejscu/)).toBeInTheDocument()
  })

  it('does not tell a new account that it withdrew anything', () => {
    /** The first screen a specialist account ever sees. It had been told, in
     *  four places at once, that it withdrew consents it was never asked for
     *  and that entries it does not have are waiting. */
    render(NEVER_GRANTED)

    expect(screen.getByText(/To konto jest nowe/)).toBeInTheDocument()
    expect(screen.queryByText(/Nic nie zostało usunięte/)).not.toBeInTheDocument()
    expect(screen.queryByText('Wycofana')).not.toBeInTheDocument()
    expect(screen.getAllByText('Jeszcze nieudzielona')).toHaveLength(CONSENTS.length)
  })

  it('asks a new account to give the consents rather than to restore them', () => {
    render(NEVER_GRANTED)

    expect(screen.getAllByRole('button', { name: 'Udzielam tej zgody' })).toHaveLength(
      CONSENTS.length,
    )
    expect(screen.getByRole('button', { name: 'Udzielam obu zgód' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Przywróć/ }),
    ).not.toBeInTheDocument()
  })

  it('still says "przywróć" to an account that really did withdraw', () => {
    /** The other half of the same distinction: the wording that was already
     *  right must not follow the new one. */
    render(LOCKED)

    expect(screen.getAllByText('Wycofana')).toHaveLength(CONSENTS.length)
    expect(screen.getAllByRole('button', { name: 'Przywróć tę zgodę' })).toHaveLength(
      CONSENTS.length,
    )
    expect(screen.queryByText(/To konto jest nowe/)).not.toBeInTheDocument()
  })

  it('quotes both consents in the wording the registration form used', () => {
    /** What is being given back has to be recognisably what was given. */
    render()

    for (const consent of CONSENTS) {
      expect(screen.getByText(consent.label)).toBeInTheDocument()
    }
  })

  it('marks which consents are missing and when they went', () => {
    render()

    expect(screen.getAllByText('Wycofana')).toHaveLength(2)
    expect(screen.getAllByText(/Wycofana 1 września 2026/)).toHaveLength(2)
  })

  it('offers the consents back even when the two dates sort the wrong way as strings', () => {
    /** THE REPORTED BUG, pinned. A consent withdrawn a fraction of a second
     *  after it was granted came back with `withdrawn_at` in UTC and
     *  `granted_at` in Europe/Warsaw; comparing those strings said the consent
     *  still held, so this screen showed "Udzielona" and no button, and the
     *  account was stuck with nothing but the logout link. Nothing here derives
     *  `active` any more — it is read from the server. */
    render(LOCKED_MIXED_ZONES)

    expect(screen.getAllByText('Wycofana')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Przywróć tę zgodę' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Przywróć obie zgody' })).toBeInTheDocument()
    expect(screen.queryByText('Udzielona')).toBeNull()
  })

  it('is never a dead end: a locked account always has something to press', () => {
    for (const user of [LOCKED, HALF_LOCKED, LOCKED_MIXED_ZONES]) {
      const { unmount } = render(user)
      expect(screen.getAllByRole('button', { name: /Przywróć/ }).length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('shows the one that still holds as granted, without a restore button', () => {
    render(HALF_LOCKED)

    expect(screen.getByText('Udzielona')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Przywróć tę zgodę' })).toHaveLength(1)
  })
})

describe('ConsentsRequired — giving a consent back', () => {
  it('restores one consent and hands the updated account to the session', async () => {
    const setUser = vi.fn()
    render(HALF_LOCKED, { setUser })

    await userEvent.click(screen.getByRole('button', { name: 'Przywróć tę zgodę' }))

    await waitFor(() => expect(mockedRestore).toHaveBeenCalledWith('services'))
    expect(setUser).toHaveBeenCalledWith(RESTORED)
  })

  it('offers restoring both at once when both are gone', async () => {
    const setUser = vi.fn()
    render(LOCKED, { setUser })

    await userEvent.click(screen.getByRole('button', { name: 'Przywróć obie zgody' }))

    await waitFor(() => expect(mockedRestore).toHaveBeenCalledWith('all'))
    expect(setUser).toHaveBeenCalledWith(RESTORED)
  })

  it('does not offer "both" when only one is missing', () => {
    render(HALF_LOCKED)

    expect(screen.queryByRole('button', { name: 'Przywróć obie zgody' })).toBeNull()
  })

  it('asks for no password — this is the direction that unblocks the account', () => {
    /** Friction here costs somebody who changed their mind and protects nobody:
     *  whoever can reach this screen is already inside the session. */
    render()

    expect(screen.queryByLabelText(/hasło/i)).toBeNull()
  })

  it('says so when the request fails, and leaves the account locked', async () => {
    mockedRestore.mockImplementation(() => Promise.reject(new ApiError(500, null)))
    const setUser = vi.fn()
    render(LOCKED, { setUser })

    await userEvent.click(screen.getByRole('button', { name: 'Przywróć obie zgody' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się zapisać zgody/)
    expect(setUser).not.toHaveBeenCalled()
  })
})

describe('ConsentsRequired — the way out is not only forwards', () => {
  it('offers signing out at the same weight as restoring', async () => {
    /** A screen that made restoring the only escape would be pressuring
     *  somebody into a consent, and a consent given under pressure is not one
     *  (art. 7(4)). */
    const signOut = vi.fn().mockResolvedValue(undefined)
    render(LOCKED, { signOut })

    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj się' }))

    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('does not pretend the consents can be withdrawn again only by writing in', () => {
    expect.hasAssertions()
    render()

    expect(screen.getByText(/możesz wycofać ponownie w każdej chwili/i)).toBeInTheDocument()
  })

  it('offers nothing from the rest of the app', () => {
    /** This is the entire surface a locked account has. A link anywhere else
     *  would bounce off the route guard, and a menu would suggest there is
     *  somewhere to go. */
    const { container } = render()

    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull()
  })
})
