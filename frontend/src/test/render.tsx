import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../api/auth'

export const TEST_USER: AuthUser = {
  id: 'b0000000-0000-0000-0000-000000000008',
  email: 'test@wp.pl',
  firstName: 'Test',
  lastName: 'Testowy',
  dateOfBirth: '1994-06-18',
  role: 'patient',
  isPatient: true,
  isChild: false,
  guardianStatus: null,
  // Both granted, as registration writes them — the ordinary account. A screen
  // testing the "Nieudzielona" state overrides one with null.
  dataConsentAt: '2026-06-18T09:31:02Z',
  servicesConsentAt: '2026-06-18T09:31:02Z',
  // Both consents in force — the ordinary account. A test about the locked
  // screen sets `consentsActive: false` and a withdrawal date.
  consentsActive: true,
  dataConsentWithdrawnAt: null,
  servicesConsentWithdrawnAt: null,
}

/**
 * Screens under test sit inside a router and a session, because their shared
 * header does (HeaderMenu reads useAuth and renders Links). Providing the
 * context directly rather than mounting AuthProvider keeps these tests about
 * the screen instead of about the session bootstrap, which has its own file.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    user = TEST_USER,
    route = '/',
    state,
    setUser = () => {},
    signOut = async () => {},
  }: {
    user?: AuthUser | null
    route?: string
    /** Navigation state, for a screen that reads something out of it — the
     *  "Zapisano" notice on /home arrives that way. */
    state?: unknown
    /** Pass a spy when the screen under test is supposed to update the session. */
    setUser?: (next: AuthUser | null) => void
    signOut?: () => Promise<void>
  } = {},
) {
  const auth: AuthContextValue = {
    user,
    loading: false,
    setUser,
    signOut,
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[state === undefined ? route : { pathname: route, state }]}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </MemoryRouter>
    )
  }

  return render(ui, { wrapper: Wrapper })
}
