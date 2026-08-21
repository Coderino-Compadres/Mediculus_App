import { createContext, useContext } from 'react'
import type { AuthUser } from '../api/auth'

export interface AuthContextValue {
  user: AuthUser | null
  /** True until the initial /api/auth/me/ answers — routes must wait for it. */
  loading: boolean
  setUser: (user: AuthUser | null) => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
