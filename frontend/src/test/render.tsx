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
  isChild: false,
  hasGuardian: null,
}

/**
 * Screens under test sit inside a router and a session, because their shared
 * header does (HeaderMenu reads useAuth and renders Links). Providing the
 * context directly rather than mounting AuthProvider keeps these tests about
 * the screen instead of about the session bootstrap, which has its own file.
 */
export function renderWithProviders(
  ui: ReactElement,
  { user = TEST_USER, route = '/' }: { user?: AuthUser | null; route?: string } = {},
) {
  const auth: AuthContextValue = {
    user,
    loading: false,
    setUser: () => {},
    signOut: async () => {},
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </MemoryRouter>
    )
  }

  return render(ui, { wrapper: Wrapper })
}
