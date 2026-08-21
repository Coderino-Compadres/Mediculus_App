import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchCurrentUser, logout as logoutRequest, type AuthUser } from '../api/auth'
import { AuthContext } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // The session cookie is HttpOnly, so the only way to know whether we are
  // logged in is to ask the server once on start-up.
  useEffect(() => {
    let active = true

    fetchCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser)
      })
      .catch(() => {
        // The API being unreachable is not the same as being logged out, but
        // from the router's point of view it leads to the same place: login.
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logoutRequest()
    } finally {
      // Drop the local user either way: a failed logout must not leave the app
      // showing a session the user has asked to end.
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, loading, setUser, signOut }), [user, loading, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
