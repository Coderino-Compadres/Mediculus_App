import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchCurrentUser, logout as logoutRequest, type AuthUser } from '../api/auth'
import { UNAUTHORIZED_EVENT } from '../api/client'
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

  // A session can end while the app is open — it expires, the server restarts,
  // somebody logs out in another tab. Before this, every screen simply started
  // answering "Nie udało się wczytać…", the menu went on showing an e-mail
  // address, and the only way out was to reload the page by hand.
  const signedIn = useRef(false)
  useEffect(() => {
    // In an effect rather than during render: a ref written while rendering is
    // a side effect React is entitled to run twice. The listener below only
    // reads it when an event fires, which is always after the commit.
    signedIn.current = user !== null
  }, [user])

  useEffect(() => {
    let active = true
    let checking = false

    async function onRefusal() {
      // A 403 is also the normal answer to /api/auth/me/ for a visitor, and the
      // answer to a CSRF token the server no longer recognises. Only one of
      // those means the session is gone, so ask rather than assume — and only
      // when there is a session to lose.
      if (!signedIn.current || checking) return
      checking = true
      try {
        const current = await fetchCurrentUser()
        if (active && current === null) setUser(null)
      } catch {
        // The check itself failed. Leaving the user signed in is the safer of
        // the two wrong answers: a network blip must not throw away a form
        // somebody is in the middle of filling.
      } finally {
        checking = false
      }
    }

    window.addEventListener(UNAUTHORIZED_EVENT, onRefusal)
    return () => {
      active = false
      window.removeEventListener(UNAUTHORIZED_EVENT, onRefusal)
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
