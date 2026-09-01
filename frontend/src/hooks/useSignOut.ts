import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { ROUTES } from '../routes'

/**
 * Signing out, and landing on the login screen afterwards.
 *
 * One implementation for the two places that offer it — the header menu and the
 * profile screen's own button. Ending a session has an easy way to be subtly
 * wrong (see the catch below), and a second copy of it would be the copy that
 * gets it wrong.
 */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  return useCallback(async () => {
    try {
      await signOut()
    } catch {
      // The local session is cleared either way (see AuthProvider.signOut); a
      // failed logout request still has to land the user back on /login.
    } finally {
      navigate(ROUTES.login, { replace: true })
    }
  }, [signOut, navigate])
}
